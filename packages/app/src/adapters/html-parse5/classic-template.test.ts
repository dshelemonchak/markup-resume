import { templateCatalog } from '@markup-resume/styles';
import { describe, expect, it } from 'vitest';
import { checkMarkup } from '../../domain/index.ts';
import { parseMarkup } from './parse-markup.ts';

// The template's own files must agree with each other: the example passes the schema, and the rules mention
// every class the schema accepts.
describe.each(templateCatalog.refs())('template %s', (ref) => {
  const schema = templateCatalog.schema(ref)!;
  const guide = templateCatalog.guide(ref)!;

  it('has an example that passes its schema', () => {
    expect(checkMarkup(parseMarkup(guide.example).tree, schema)).toEqual([]);
  });

  it('explains every class of its schema in its rules', () => {
    const classes = Object.entries(schema.classes).flatMap(([name, rule]) => [name, ...(rule.oneOf ?? [])]);
    expect(classes.filter((name) => !guide.rules.includes(name))).toEqual([]);
  });
});
