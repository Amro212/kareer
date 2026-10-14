import { Editor, Node, Extension } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import { UndoRedo } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { modelToEditor, editorToModel, editorSections, categoryLabel } from './editor-model.js';
import { skillsAreCategorized } from './document-format.js';

const element = (tag, className, text) => { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; };

export function createMaterialEditor({ container, model, onUpdate, onSelection, onRewrite }) {
  const sections = editorSections(model), ids = sections.map(s => s.id);
  const MaterialSection = Node.create({
    name: 'materialSection', group: 'block', content: 'materialKeywords? paragraph+', isolating: true, defining: true,
    selectable: false,
    addAttributes: () => ({ id: { default: null } }),
    parseHTML: () => [{ tag: 'section[data-material-section]' }],
    renderHTML: ({ node }) => ['section', { 'data-material-section': node.attrs.id }, 0],
    addNodeView: () => ({ node }) => {
      const section = sections.find(s => s.id === node.attrs.id);
      const dom = element('section', 'material-section'); dom.dataset.materialSection = section.id;
      const heading = element('div', 'material-heading'); heading.contentEditable = 'false';
      if (model.kind !== 'coverLetter') {
        const previous = sections[sections.indexOf(section) - 1];
        if (section.category && previous?.category !== section.category) heading.append(element('h2', 'paper-category', categoryLabel(section.category)));
        if (section.id === 'summary') heading.append(element('h2', 'paper-category', 'Summary'));
        else if (section.category !== 'Skills') {
          const title = element('div', 'paper-title');
          title.append(element('strong', '', section.label), element('span', '', section.dates || ''));
          heading.append(title);
          const facts = element('div', 'paper-facts'); facts.append(element('span', '', section.subtitle || ''), element('span', '', section.location || ''));
          if (section.subtitle || section.location) heading.append(facts);
          if (!section.subtitle && !section.location && section.facts) heading.append(element('p', 'paper-facts', section.facts));
        }
      }
      const contentDOM = element('div', `paper-text ${model.kind === 'coverLetter' ? 'paper-letter' : section.id === 'summary' ? 'paper-summary' : section.category === 'Skills' ? 'paper-skills' : 'paper-bullets'}`);
      const updateSkillsLayout = next => {
        if (section.category === 'Skills') contentDOM.classList.toggle('paper-skills-inline', !skillsAreCategorized(next.content.content.map(p => p.textContent)));
      };
      updateSkillsLayout(node);
      contentDOM.dataset.editableSection = section.id;
      if (section.id === 'summary') contentDOM.id = 'resume-summary';
      if (model.kind === 'resume' && section.id !== 'summary') contentDOM.dataset.section = String(model.sections.findIndex(s => s.id === section.id));
      const rewrite = element('button', 'section-rewrite secondary', 'Rewrite');
      rewrite.type = 'button'; rewrite.contentEditable = 'false'; rewrite.setAttribute('aria-label', model.kind === 'coverLetter' ? 'Rewrite selected paragraph' : `Rewrite ${section.label}`);
      rewrite.dataset.rewrite = model.kind === 'coverLetter' ? 'letter' : section.id === 'summary' ? 'summary' : `section:${section.id}`;
      rewrite.onmousedown = event => event.preventDefault();
      rewrite.onclick = () => onRewrite(section.id);
      dom.append(heading, contentDOM, rewrite);
      return { dom, contentDOM,
        update(next) { if (next.type !== node.type || next.attrs.id !== section.id) return false; updateSkillsLayout(next); return true; },
        stopEvent: event => rewrite.contains(event.target),
        ignoreMutation: mutation => mutation.type !== 'selection' && !contentDOM.contains(mutation.target) };
    },
  });
  const Keywords = Node.create({
    name: 'materialKeywords', content: 'inline*', marks: '', defining: true,
    parseHTML: () => [{ tag: 'p[data-material-keywords]' }],
    renderHTML: () => ['p', { 'data-material-keywords': '', class: 'paper-keywords', 'aria-label': 'Project keywords, separated by commas' }, 0],
    addKeyboardShortcuts() { return { Enter: () => this.editor.isActive('materialKeywords') && this.editor.commands.setTextSelection(this.editor.state.selection.$from.after() + 1) }; },
  });
  const Boundaries = Extension.create({
    name: 'materialBoundaries',
    addProseMirrorPlugins: () => [new Plugin({ filterTransaction: transaction => {
      if (!transaction.docChanged) return true;
      const next = []; transaction.doc.forEach(node => next.push(node.attrs.id));
      return next.length === ids.length && next.every((id, index) => id === ids[index]);
    } })],
  });
  const editor = new Editor({ element: container, injectCSS: false,
    extensions: [Document.extend({ content: 'materialSection+' }), MaterialSection, Keywords, Paragraph, Text, HardBreak, UndoRedo, Boundaries],
    content: modelToEditor(model),
    editorProps: { attributes: { class: 'document-content', role: 'textbox', 'aria-label': model.kind === 'resume' ? 'Resume document' : 'Cover letter document', 'aria-multiline': 'true', spellcheck: 'true' },
      // The export model has plain text only. Flatten unsupported rich clipboard content.
      transformPastedHTML: html => {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        for (const node of parsed.querySelectorAll('script,style,iframe,object')) node.remove();
        const selector = 'p,li,h1,h2,h3,h4,h5,h6,pre';
        const blocks = [...parsed.body.querySelectorAll(selector)].filter(node => !node.querySelector(selector));
        return (blocks.length ? blocks : [...parsed.body.childNodes]).map(node => {
          const p = document.createElement('p');
          const clone = node.cloneNode(true);
          for (const br of clone.querySelectorAll?.('br') || []) br.replaceWith('\n');
          for (const [index, line] of clone.textContent.split('\n').entries()) {
            if (index) p.append(document.createElement('br'));
            p.append(document.createTextNode(line));
          }
          return p.outerHTML;
        }).join('');
      },
    },
    onUpdate: () => onUpdate(),
    onSelectionUpdate: ({ editor }) => {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type.name === 'materialSection') { onSelection($from.node(depth).attrs.id); break; }
    },
  });
  return {
    editor,
    model: () => editorToModel(editor.getJSON(), model),
    focusSection(id) {
      editor.state.doc.forEach((node, pos) => {
        if (node.attrs.id !== id) return;
        editor.commands.setTextSelection(pos + 2);
        // Tiptap's focus command defers DOM focus to the next animation frame.
        // A direct view focus completes navigation before the next typing or
        // replacement operation can establish its own selection.
        editor.view.focus();
      });
      [...container.querySelectorAll('[data-material-section]')].find(el => el.dataset.materialSection === id)?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    },
    rewritePath(id) {
      if (model.kind !== 'coverLetter') return id === 'summary' ? 'summary' : `section:${id}`;
      const section = editor.state.doc.firstChild, pos = editor.state.selection.from;
      let index = 0, offset = 1;
      section.forEach((paragraph, start, i) => { if (pos >= offset + start) index = i; });
      if (!section.child(index).textContent.trim()) throw new Error('Select a paragraph with text before rewriting.');
      // Empty paragraphs are omitted by the existing export model.
      return `paragraph:${section.content.content.slice(0, index).filter(p => p.textContent.trim()).length}`;
    },
    replace(model, path) {
      const next = modelToEditor(model);
      const id = path.startsWith('paragraph:') ? 'letter' : path === 'summary' ? 'summary' : path.slice(8);
      const replacement = next.content.find(s => s.attrs.id === id);
      editor.state.doc.forEach((node, pos) => {
        if (node.attrs.id !== id) return;
        if (model.kind === 'coverLetter') {
          const index = Number(path.slice(10));
          // Map exported paragraph indexes back to non-empty editor paragraphs.
          let current = 0;
          node.forEach((p, offset) => { if (p.textContent.trim() && current++ === index) editor.commands.insertContentAt({ from: pos + 1 + offset, to: pos + 1 + offset + p.nodeSize }, replacement.content[index]); });
        } else editor.commands.insertContentAt({ from: pos + 1, to: pos + node.nodeSize - 1 }, replacement.content);
      });
    },
    destroy: () => editor.destroy(),
  };
}
