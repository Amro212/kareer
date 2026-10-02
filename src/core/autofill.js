import { generateAutofillAnswers } from './ai.js';
import { harvestComboboxOptions } from './fields/scanner.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { logger } from './debug.js';
import { getProfile } from './storage.js';
import { adapterById } from './adapters/index.js';
import { findExactOption } from './fields/combobox.js';

// One bounded discovery pass for remote/paginated comboboxes. Queries never fill fields.
export async function resolveComboboxSearchAnswers(fields, response, context = {}) {
  const queries = new Map(response.answers
    .filter(answer => answer.value === '' && typeof answer.searchQuery === 'string' && answer.searchQuery.trim())
    .map(answer => [answer.fieldId, answer.searchQuery]));
  const searchFields = fields.filter(field => field.type === 'combobox' && queries.has(field.id));
  if (!searchFields.length) return response;

  await harvestComboboxOptions(searchFields, queries);
  if (context.isCurrent?.() === false) return response;
  const discovered = searchFields.filter(field => field.options.length);
  if (!discovered.length) return response;
  try {
    return { ...response, answers: await resolveDiscoveredAnswers(normalizeFieldsForAI(discovered), response.answers, context) };
  } catch (err) {
    // Keep the primary answers usable if the optional search-resolution request fails.
    logger.warn(`Combobox search resolution failed: ${err.message}`);
    return response;
  }
}

export async function resolveDiscoveredAnswers(fields, answers, context = {}) {
  const resolved = answers.map(answer => {
    const field = fields.find(field => field.fieldId === answer.fieldId);
    if (!field) return answer;
    const fixed = adapterById(field.ats?.adapter).resolveAnswer?.(field, getProfile(), {...context,allowSearch:false});
    if (fixed?.value != null && fixed.value !== '' && (!Array.isArray(fixed.value) || fixed.value.length)) return fixed;
    const option = findExactOption(field.options || [], answer.searchQuery, field);
    return option ? {...answer,value:option.label,searchQuery:undefined} : {...answer,value:'',searchQuery:undefined};
  });
  // Options discovered only after searching get one contextual late-field pass.
  // An empty recipe is still unresolved, never a reason to suppress inference.
  const pending = fields.filter(field => field.options?.length && answers.some(answer => answer.fieldId === field.fieldId && answer.searchQuery) && resolved.some(answer => answer.fieldId === field.fieldId && answer.value === ''));
  if (!pending.length || context.isCurrent?.() === false) return resolved;
  try {
    const contextual = await generateAutofillAnswers(pending, {...context,allowSearch:false});
    const byId = new Map(contextual.answers.map(answer => [answer.fieldId,answer]));
    return resolved.map(answer => byId.get(answer.fieldId) || answer);
  } catch (error) {
    logger.warn(`Discovered option resolution failed: ${error.message}`);
    return resolved;
  }
}
