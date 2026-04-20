import * as p from '@clack/prompts';
import {
  PROVIDER_NAMES,
  setStoredApiKey,
  type ProviderName,
} from '@lxmanh/shed-agent';
import pc from 'picocolors';

export async function setKeyCommand(provider: string): Promise<void> {
  if (!PROVIDER_NAMES.includes(provider as ProviderName)) {
    console.error(
      `Unknown provider "${provider}". Valid: ${PROVIDER_NAMES.join(', ')}`,
    );
    process.exit(1);
  }

  p.intro(pc.bgMagenta(pc.black(' shed set-key ')));

  const key = await p.password({
    message: `Enter API key for ${pc.cyan(provider)}:`,
    validate: (v) => (v.length < 8 ? 'Key too short' : undefined),
  });

  if (p.isCancel(key)) {
    p.cancel('Cancelled.');
    return;
  }

  await setStoredApiKey(provider as ProviderName, key as string);
  p.outro(`${pc.green('✓')} API key for ${pc.cyan(provider)} saved to keychain.`);
}
