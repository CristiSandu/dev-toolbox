import { performance } from 'node:perf_hooks';
import { cpus, platform, arch, release } from 'node:os';
import { formatXml } from '../src/lib/xml-formatting.ts';

console.log(JSON.stringify({ node: process.version, os: platform(), release: release(), arch: arch(), cpu: cpus()[0].model }));
const element = '<TextBlock Grid.Row="1" Text="{Binding Name}" />';
for (const targetBytes of [100_000, 1_000_000]) {
  const input = `<Grid xmlns:x="urn:test">${element.repeat(Math.ceil(targetBytes / element.length))}</Grid>`;
  const run = () => {
    const start = performance.now();
    const output = formatXml(input);
    const elapsed = performance.now() - start;
    if (!output.includes('Text="{Binding Name}"')) throw new Error('Formatter lost fixture content');
    return elapsed;
  };
  const coldMs = run();
  const samples = Array.from({ length: 10 }, run).sort((a, b) => a - b);
  console.log(JSON.stringify({ inputBytes: Buffer.byteLength(input), coldMs: +coldMs.toFixed(2), warmMedianMs: +((samples[4] + samples[5]) / 2).toFixed(2), warmMaxMs: +samples[9].toFixed(2), samples: samples.length }));
}
