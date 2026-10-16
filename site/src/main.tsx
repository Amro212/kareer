import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './app';
import { setMotionMode, setFlowSettings } from '@/lib/cojeev-motion/settings';
import './styles.css';

setMotionMode('subtle');
setFlowSettings({ variant: 'comet', hover: true, speed: 0.85, intensity: 1.75, hoverStrength: 0.75 });

const root = document.getElementById('root')!;
const app = <App page={document.documentElement.dataset.page} />;
if (root.dataset.rendered) hydrateRoot(root, app);
else createRoot(root).render(app);
