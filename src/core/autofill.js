import { generateAutofillAnswers } from './ai.js';
import { harvestComboboxOptions } from './fields/scanner.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { logger } from './debug.js';
import { getProfile } from './storage.js';
import { detectAdapter } from './adapters/index.js';
import { workdayAnswer } from './adapters/workday-fields.js';
import { findExactOption } from './fields/combobox.js';

// One bounded discovery pass for remote/paginated comboboxes. Queries never fill fields.
export async function resolveComboboxSearchAnswers(fields, response) {
  const queries = new Map(response.answers
    .filter(answer => answer.value === '' && typeof answer.searchQuery === 'string' && answer.searchQuery.trim())
    .map(answer => [answer.fieldId, answer.searchQuery]));
  const searchFields = fields.filter(field => field.type === 'combobox' && queries.has(field.id));
  if (!searchFields.length) return response;

  await harvestComboboxOptions(searchFields, queries);
  const discovered = searchFields.filter(field => field.options.length);
  if (!discovered.length) return response;
  const adapter = detectAdapter();
  if (typeof adapter.resolveAnswer === 'function' || discovered.every(field => field.ats?.adapter === 'workday')) {
    return { ...response, answers: response.answers.map(answer => {
      const field = discovered.find(field => field.id === answer.fieldId);
      if (!field) return answer;
      const fixed = adapter.resolveAnswer?.(field, getProfile()) || workdayAnswer(field, getProfile());
      if (fixed) return fixed;
      const option = findExactOption(field.options, answer.searchQuery, field);
      return option ? { ...answer, value: option.label, searchQuery: undefined } : answer;
    }) };
  }
  try {
    const resolved = await generateAutofillAnswers(normalizeFieldsForAI(discovered), { allowSearch: false });
    const byId = new Map(resolved.answers.map(answer => [answer.fieldId, answer]));
    return { ...response, answers: response.answers.map(answer => byId.get(answer.fieldId) || answer) };
  } catch (err) {
    // Keep the primary answers usable if the optional search-resolution request fails.
    logger.warn(`Combobox search resolution failed: ${err.message}`);
    return response;
  }
}
