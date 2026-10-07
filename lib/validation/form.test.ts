import { describe, expect, it } from 'vitest';
import { formSchema, isAllowedForm, rejectedFields } from './form';
import { FORMS } from '@/schemas/forms';

function form(entries: [string, string | Blob][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('strict form schemas', () => {
  const schema = formSchema(['id', 'archived']);

  it('accepts exactly the listed fields, each optional', () => {
    expect(
      isAllowedForm(
        form([
          ['id', 'a'],
          ['archived', 'true'],
        ]),
        schema,
      ),
    ).toBe(true);
    expect(isAllowedForm(form([['id', 'a']]), schema)).toBe(true);
  });

  it('rejects a field the form does not have', () => {
    const data = form([
      ['id', 'a'],
      ['user_id', 'someone-else'],
    ]);
    expect(isAllowedForm(data, schema)).toBe(false);
    expect(rejectedFields(data, schema)).toEqual(['user_id']);
  });

  it('rejects a repeated field rather than picking one', () => {
    expect(
      isAllowedForm(
        form([
          ['id', 'a'],
          ['id', 'b'],
        ]),
        schema,
      ),
    ).toBe(false);
  });

  it('rejects a file where text was expected', () => {
    expect(isAllowedForm(form([['id', new Blob(['x'])]]), schema)).toBe(false);
  });

  it("ignores React's own $ACTION_ keys", () => {
    expect(
      isAllowedForm(
        form([
          ['$ACTION_ID_abc', ''],
          ['id', 'a'],
        ]),
        schema,
      ),
    ).toBe(true);
  });

  it('a no-input action rejects any field', () => {
    expect(isAllowedForm(form([]), FORMS.recurring.generateOccurrences)).toBe(true);
    expect(
      isAllowedForm(form([['user_id', 'x']]), FORMS.recurring.generateOccurrences),
    ).toBe(false);
  });

  it('draft fields match their pattern and nothing else', () => {
    const drafts = FORMS.extraction.confirmDrafts;
    expect(
      isAllowedForm(
        form([
          ['extractionId', 'e'],
          ['d0.amount', '1'],
          ['d29.selected', 'on'],
        ]),
        drafts,
      ),
    ).toBe(true);
    expect(isAllowedForm(form([['d0.user_id', 'x']]), drafts)).toBe(false);
    expect(isAllowedForm(form([['d30.amount', '1']]), drafts)).toBe(false);
    expect(isAllowedForm(form([['status', 'confirmed']]), drafts)).toBe(false);
  });
});
