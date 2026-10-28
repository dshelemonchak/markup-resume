import { type DefaultTreeAdapterMap, parse } from 'parse5';
import type { MarkupElement } from '../../domain/index.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

/**
 * The domain's ParseMarkup port on parse5, which builds the tree the way the HTML standard (and so Chrome)
 * does: a misplaced or unclosed tag ends up where the browser would put it, so the checks see what renders.
 * Returns the <html> element.
 */
export function parseMarkup(html: string): MarkupElement {
  const document = parse(html);
  const root = document.childNodes.find(isElement);
  // parse5 always creates <html>, whatever the input.
  if (!root) throw new Error('parse5 returned a document without <html>');
  return toMarkup(root);
}

function toMarkup(element: Element): MarkupElement {
  return {
    tag: element.tagName,
    attributes: new Map(element.attrs.map((attribute) => [attribute.name, attribute.value])),
    children: element.childNodes.filter(isElement).map(toMarkup),
  };
}

function isElement(node: Node): node is Element {
  return 'tagName' in node;
}
