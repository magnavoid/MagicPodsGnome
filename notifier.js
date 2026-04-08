// notifier.js — low battery notification logic
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ConnectionState} from './backend.js';

export const CONTAINER = 'gnome-magicpods';
export const SETTING_THRESHOLD = 'low-battery-threshold';
export const THRESHOLD_OPTIONS = [0, 10, 20, 30]; // 0 = disabled

// Battery status 2 = Connected (from API reference)
const BATTERY_CONNECTED = 2;

export class LowBatteryNotifier {
    constructor(backend) {
        this._backend = backend;
        this._threshold = 0;  // disabled until setting is loaded
        this._canNotify = true;

        this._ids = [
            backend.connect('connection-state-changed', (_, state) => {
                if (state === ConnectionState.CONNECTED)
                    backend.getSetting(CONTAINER, SETTING_THRESHOLD);
            }),
            backend.connect('settings-changed', (_, json) => {
                const settings = JSON.parse(json);
                const val = settings?.[CONTAINER]?.[SETTING_THRESHOLD];
                if (val != null)
                    this._threshold = Number(val);
            }),
            backend.connect('info-changed', (_, json) => {
                this._onInfoChanged(JSON.parse(json));
            }),
        ];
    }

    destroy() {
        this._ids.forEach(id => this._backend.disconnect(id));
    }

    // Called by the indicator when the user picks a new threshold
    setThreshold(value) {
        this._threshold = value;
        this._backend.setSetting(CONTAINER, SETTING_THRESHOLD, value);
        this._canNotify = true; // allow a fresh notification at the new level
    }

    getThreshold() {
        return this._threshold;
    }

    _onInfoChanged(info) {
        if (!info || Object.keys(info).length === 0) {
            // Headphones disconnected — reset so we can notify again on reconnect
            this._canNotify = true;
            return;
        }

        if (this._threshold <= 0 || !this._canNotify) return;

        const battery = info.capabilities?.battery;
        if (!battery) return;

        let minBattery = 100;
        for (const slot of ['single', 'left', 'right', 'case']) {
            const b = battery[slot];
            if (!b) continue;
            if (b.status !== BATTERY_CONNECTED) continue;
            if (b.charging) continue;
            if (b.battery === 0) continue; // ignore bogus 0% readings
            if (b.battery < minBattery)
                minBattery = b.battery;
        }

        if (minBattery <= this._threshold) {
            this._canNotify = false;
            const name = info.name ?? 'Headphones';
            Main.notify('MagicPods', `${name} battery is low: ${minBattery}%`);
        }
    }
}
