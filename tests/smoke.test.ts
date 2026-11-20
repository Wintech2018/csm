import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strings } from '../src/strings';

describe('scaffold', () => {
  it('has the privacy notice from spec §8', () => {
    expect(strings.privacyNotice).toBe('文件只在本机浏览器中处理，不会上传。');
  });

  it('runs in jsdom with DOMParser available', () => {
    const doc = new DOMParser().parseFromString('<a/>', 'application/xml');
    expect(doc.documentElement.nodeName).toBe('a');
  });

  it('public example matches the fixture', () => {
    const a = readFileSync('fixtures/gateway.drawio', 'utf8');
    const b = readFileSync('public/examples/gateway.drawio', 'utf8');
    expect(b).toBe(a);
  });
});
