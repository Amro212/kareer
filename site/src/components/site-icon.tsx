import { Icon as CojeevIcon } from '@/components/ui/icon';

const names: Record<string, string> = {
  arrow: 'arrow-right', diagonal: 'arrow-up-right', check: 'check', play: 'play', reset: 'refresh-cw',
  file: 'file-text', lock: 'lock', menu: 'menu', close: 'x', plus: 'plus', code: 'code',
  sparkles: 'sparkles', user: 'user', settings: 'settings', briefcase: 'briefcase', alert: 'circle-alert',
  shield: 'shield-check', search: 'search',
};

export function Icon({ name = 'arrow', size = 20, feedback }: { name?: string; size?: number; feedback?: boolean }) {
  return <CojeevIcon name={names[name] ?? name} feedback={feedback} style={{ width: size, height: size }} />;
}
