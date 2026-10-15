/** Serial I/O, live typing. Export acknowledgements never replace the editor. */
export class MaterialAutosave {
  constructor({ record, draft, read, request, onState, onCompiled, draftDelay = 400, compileDelay = 1600 }) {
    Object.assign(this, { record, read, request, onState, onCompiled, draftDelay, compileDelay });
    this.liveRead = read;
    this.draftRevision = draft?.revision || null;
    this.persisted = draft ? JSON.stringify({ model: draft.model, pageTarget: draft.pageTarget }) : JSON.stringify(read());
    this.compiled = JSON.stringify({ model: record.model, pageTarget: record.options?.pageTarget || 1 });
    this.tail = Promise.resolve();
    this.disposed = false;
    this.error = null;
    this.notify();
  }
  get pending() { return JSON.stringify(this.read()) !== this.persisted; }
  get needsCompile() { return JSON.stringify(this.read()) !== this.compiled; }
  notify(state) {
    if (!this.disposed) this.onState(state || (this.error ? 'error' : this.pending ? 'saving' : this.needsCompile ? 'draft' : 'saved'), this.error);
  }
  enqueue(work) {
    const next = this.tail.catch(() => {}).then(work);
    this.tail = next;
    return next.catch(error => { this.error = error; this.notify('error'); throw error; });
  }
  change() {
    this.error = null;
    clearTimeout(this.draftTimer); clearTimeout(this.compileTimer);
    this.notify();
    this.draftTimer = setTimeout(() => void this.persist().catch(() => {}), this.draftDelay);
    this.compileTimer = setTimeout(() => void this.flush().catch(() => {}), this.compileDelay);
  }
  async persistNow() {
    const snapshot = this.read(), signature = JSON.stringify(snapshot);
    if (signature === this.persisted) return;
    this.notify('saving');
    const draft = await this.request('putDraft', { id: this.record.id, revision: this.record.revision, draftRevision: this.draftRevision, ...snapshot });
    this.draftRevision = draft.revision;
    this.persisted = signature;
    this.error = null;
    this.notify();
  }
  persist() { clearTimeout(this.draftTimer); return this.enqueue(() => this.persistNow()); }
  flush() {
    clearTimeout(this.compileTimer);
    return this.enqueue(async () => {
      await this.persistNow();
      const snapshot = this.read(), signature = JSON.stringify(snapshot);
      if (signature === this.compiled) {
        if (this.draftRevision) { await this.request('discardDraft', { id: this.record.id, draftRevision: this.draftRevision }); this.draftRevision = null; }
        this.error = null; this.notify();
        return this.record;
      }
      this.notify('compiling');
      const record = await this.request('save', { id: this.record.id, revision: this.record.revision, draftRevision: this.draftRevision, ...snapshot });
      this.record = record;
      this.draftRevision = null;
      this.compiled = signature;
      this.error = null;
      if (!this.disposed) this.onCompiled(record);
      this.notify();
      return record;
    });
  }
  dispose() {
    const snapshot = this.read(); this.read = () => snapshot;
    this.disposed = true; clearTimeout(this.draftTimer); clearTimeout(this.compileTimer);
  }
  resume() { this.read = this.liveRead; this.disposed = false; this.notify(); }
}
