import pc from 'picocolors';

const ART = [
  '  ____  _              _ ',
  ' / ___|| |__   ___  __| |',
  " \\___ \\| '_ \\ / _ \\/ _` |",
  '  ___) | | | |  __/ (_| |',
  ' |____/|_| |_|\\___|\\__,_|',
].join('\n');

export function printLogo(version: string): void {
  console.log(pc.cyan(ART));
  console.log(`  ${pc.dim(`v${version} · safe disk cleanup for developers`)}`);
  console.log(
    `  ${pc.dim('by')} ${pc.white('Lê Xuân Mạnh')} ${pc.dim('· https://github.com/lexmanh/shed')}\n`,
  );
}
