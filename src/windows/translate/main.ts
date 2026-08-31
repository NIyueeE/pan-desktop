import { mount } from 'svelte';

import { bootWindow } from '../../lib/boot';
import App from './App.svelte';

void bootWindow(App);
