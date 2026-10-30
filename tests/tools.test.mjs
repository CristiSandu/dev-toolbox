import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTaskNames } from '../src/lib/task-generation.ts';
import { formatXml } from '../src/lib/xml-formatting.ts';

test('task names preserve the issue key, summary, and selected branch type', () => {
  for (const type of ['feature', 'bugfix', 'hotfix']) {
    assert.deepEqual(generateTaskNames('DEV-42', 'Fix login / logout', type), {
      branch: `${type}/DEV-42-fix-login-logout`,
      prTitle: 'DEV-42: Fix login / logout',
    });
  }
});

test('task normalization retains current edge behavior rather than changing saved conventions', () => {
  assert.deepEqual(generateTaskNames('X-1', '  Café!  ', 'feature'), {
    branch: 'feature/X-1--caf-',
    prTitle: 'X-1:   Café!  ',
  });
  assert.deepEqual(generateTaskNames('', '', 'feature'), {
    branch: 'feature/-', prTitle: ': ',
  });
});

test('XML formatting retains attributes, text, and self-closing elements', () => {
  assert.equal(
    formatXml('<root><item id="1">Hello &amp; goodbye</item><empty /></root>'),
    '<root>\n    <item id="1">Hello &amp; goodbye</item>\n    <empty />\n</root>',
  );
});

test('XAML formatting retains namespaces, bindings, and attached properties', () => {
  const formatted = '<Grid\n    xmlns:x="urn:test">\n    <TextBlock Grid.Row="1" Text="{Binding Name}" />\n</Grid>';
  assert.equal(formatXml('<Grid xmlns:x="urn:test"><TextBlock Grid.Row="1" Text="{Binding Name}" /></Grid>'), formatted);
  assert.equal(formatXml(formatted), formatted);
  assert.equal(formatXml(''), '');
});
