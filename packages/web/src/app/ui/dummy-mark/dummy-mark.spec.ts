import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DummyMark, dummyPattern } from './dummy-mark';

@Component({
  imports: [DummyMark],
  template: `<button cvcDummy>Export</button>
    <div [cvcDummy]="word()">Soon</div>`,
})
class Host {
  readonly word = signal('soon');
}

const svgOf = (pattern: string) =>
  decodeURIComponent(/^url\("data:image\/svg\+xml,(.*)"\)$/.exec(pattern)![1]!);

describe('dummyPattern', () => {
  it('repeats the word at 45° with a 1rem gap', () => {
    const svg = svgOf(dummyPattern('dummy'));
    expect(svg).toContain('>dummy</text>');
    expect(svg).toContain('patternTransform="rotate(-45)"');
    // 5 characters × 6px + 16px gap; 10px text + 16px gap.
    expect(svg).toContain('width="46" height="26"');
  });

  it('escapes the word', () => {
    expect(svgOf(dummyPattern('<b>&'))).toContain('>&#60;b&#62;&#38;</text>');
  });
});

describe('DummyMark', () => {
  it('marks the element with the default or the given word', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [button, div] = [...(fixture.nativeElement as HTMLElement).children] as HTMLElement[];

    expect(button!.classList).toContain('cvc-dummy');
    expect(svgOf(button!.style.getPropertyValue('--cvc-dummy-pattern'))).toContain('>dummy</text>');
    expect(svgOf(div!.style.getPropertyValue('--cvc-dummy-pattern'))).toContain('>soon</text>');

    fixture.componentInstance.word.set('later');
    await fixture.whenStable();
    expect(svgOf(div!.style.getPropertyValue('--cvc-dummy-pattern'))).toContain('>later</text>');
  });
});
