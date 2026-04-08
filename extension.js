// extension.js — entry point for the MagicPods GNOME Shell extension
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Backend} from './backend.js';
import {MagicPodsIndicator} from './indicator.js';
import {LowBatteryNotifier} from './notifier.js';

export default class MagicPodsExtension extends Extension {
    enable() {
        const binaryPath = `${this.path}/bin/magicpodscore`;

        this._backend = new Backend(binaryPath);
        this._notifier = new LowBatteryNotifier(this._backend);
        this._indicator = new MagicPodsIndicator(this._backend, this, this._notifier);

        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._backend.enable();
    }

    disable() {
        this._backend?.disable();
        this._notifier?.destroy();
        this._indicator?.destroy();
        this._indicator = null;
        this._notifier = null;
        this._backend = null;
    }
}
