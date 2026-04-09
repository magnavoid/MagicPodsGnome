// indicator.js — Quick Settings panel UI
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {ConnectionState} from './backend.js';
import {THRESHOLD_OPTIONS} from './notifier.js';

// ANC bitmask values (from API reference)
const ANC_MODES = [
    {bit: 16, id: 'nc',           label: 'ANC'},
    {bit:  4, id: 'adaptive',     label: 'Adaptive'},
    {bit:  2, id: 'transparency', label: 'Transparent'},
    {bit:  8, id: 'wind',         label: 'Wind'},
    {bit:  1, id: 'off',          label: 'Off'},
];

// Battery status enum
const BATTERY_STATUS_NOT_AVAILABLE = 0;

function batteryLabel(slot) {
    return {single: '', left: 'L', right: 'R', case: 'Case'}[slot] ?? slot;
}

// ── Battery row ─────────────────────────────────────────────────────────────

function batteryIconName(level, charging) {
    const rounded = Math.round(level / 10) * 10;
    return `battery-level-${rounded}${charging ? '-charging' : ''}-symbolic`;
}

function makeBatteryBox(battery) {
    const box = new St.BoxLayout({style_class: 'magicpods-battery-box'});

    for (const slot of ['left', 'right', 'single', 'case']) {
        const b = battery[slot];
        if (!b || b.status === BATTERY_STATUS_NOT_AVAILABLE) continue;
        if (slot === 'case' && b.battery === 0) continue;

        const slotBox = new St.BoxLayout({
            style_class: 'magicpods-battery-slot',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });

        const icon = new St.Icon({
            icon_name: batteryIconName(b.battery, b.charging),
            style_class: 'magicpods-battery-icon',
            x_align: Clutter.ActorAlign.CENTER,
        });

        const pctStyle = b.charging
            ? 'magicpods-battery-pct magicpods-battery-charging'
            : 'magicpods-battery-pct';
        const pct = new St.Label({
            text: `${b.battery}%`,
            style_class: pctStyle,
            x_align: Clutter.ActorAlign.CENTER,
        });

        const lbl = new St.Label({
            text: batteryLabel(slot),
            style_class: 'magicpods-battery-label',
            x_align: Clutter.ActorAlign.CENTER,
        });

        slotBox.add_child(icon);
        slotBox.add_child(pct);
        slotBox.add_child(lbl);
        box.add_child(slotBox);
    }

    return box;
}

// ── ANC buttons ─────────────────────────────────────────────────────────────

function makeAncBox(anc, address, backend) {
    const row = new St.BoxLayout({style_class: 'magicpods-anc-row'});
    const options = anc.options ?? 0;

    for (const mode of ANC_MODES.filter(m => options & m.bit)) {
        const btn = new St.Button({
            label: mode.label,
            style_class: anc.selected === mode.bit
                ? 'magicpods-anc-btn magicpods-anc-active'
                : 'magicpods-anc-btn',
            x_expand: true,
            can_focus: true,
            reactive: !anc.readonly,
        });
        if (!anc.readonly)
            btn.connect('clicked', () => backend.setAnc(address, mode.bit));
        row.add_child(btn);
    }

    return row;
}

// ── Main toggle ─────────────────────────────────────────────────────────────

const MagicPodsToggle = GObject.registerClass(
class MagicPodsToggle extends QuickMenuToggle {
    _init(backend, extensionObject, notifier) {
        super._init({
            title: 'MagicPods',
            subtitle: 'Not connected',
            iconName: 'audio-headset-symbolic',
            toggleMode: false,
        });

        this._backend = backend;
        this._ext = extensionObject;
        this._notifier = notifier;
        this._currentAddress = null;

        // ── Menu sections (built once, updated in place) ───────────────────

        // Connection status (shown when not ready)
        this._statusItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._statusItem);

        // Devices — dropdown submenu at the top
        this._devicesItem = new PopupMenu.PopupSubMenuMenuItem(
            this._ext.gettext('No device'));
        this.menu.addMenuItem(this._devicesItem);

        // ANC
        this._ancSep = new PopupMenu.PopupSeparatorMenuItem(
            this._ext.gettext('Noise Control'));
        this.menu.addMenuItem(this._ancSep);
        this._ancItem = new PopupMenu.PopupBaseMenuItem({
            activate: false, can_focus: false,
        });
        this.menu.addMenuItem(this._ancItem);

        // Battery
        this._batterySep = new PopupMenu.PopupSeparatorMenuItem(
            this._ext.gettext('Battery'));
        this.menu.addMenuItem(this._batterySep);
        this._batteryItem = new PopupMenu.PopupBaseMenuItem({
            activate: false, can_focus: false,
        });
        this.menu.addMenuItem(this._batteryItem);

        // Low battery threshold
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(
            this._ext.gettext('Low Battery Alert')));
        this._thresholdItem = new PopupMenu.PopupBaseMenuItem({
            activate: false, can_focus: false,
        });
        this._thresholdBox = new St.BoxLayout({style_class: 'magicpods-anc-row', x_expand: true});
        this._thresholdItem.add_child(this._thresholdBox);
        this.menu.addMenuItem(this._thresholdItem);
        this._buildThresholdButtons(notifier.getThreshold());

        // Rebuild threshold buttons when the setting loads from the backend
        backend.connect('settings-changed', (_, json) => {
            const settings = JSON.parse(json);
            const val = settings?.['gnome-magicpods']?.['low-battery-threshold'];
            if (val != null) this._buildThresholdButtons(Number(val));
        });

        this._setConnectedState(false);

        // ── Backend signals ────────────────────────────────────────────────

        this._signalIds = [
            backend.connect('connection-state-changed',
                (_, state) => this._onStateChanged(state)),
            backend.connect('info-changed',
                (_, json) => this._onInfoChanged(JSON.parse(json))),
            backend.connect('devices-changed',
                (_, json) => this._onDevicesChanged(JSON.parse(json))),
        ];
    }

    destroy() {
        this._signalIds.forEach(id => this._backend.disconnect(id));
        super.destroy();
    }

    // ── State helpers ───────────────────────────────────────────────────────

    _buildThresholdButtons(currentThreshold) {
        this._thresholdBox.destroy_all_children();
        for (const val of THRESHOLD_OPTIONS) {
            const label = val === 0 ? 'Off' : `${val}%`;
            const btn = new St.Button({
                label,
                x_expand: true,
                can_focus: true,
                style_class: currentThreshold === val
                    ? 'magicpods-anc-btn magicpods-anc-active'
                    : 'magicpods-anc-btn',
            });
            btn.connect('clicked', () => {
                this._notifier.setThreshold(val);
                this._buildThresholdButtons(val);
            });
            this._thresholdBox.add_child(btn);
        }
    }

    _setConnectedState(connected) {
        this._ancSep.visible = connected;
        this._ancItem.visible = connected;
        this._batterySep.visible = connected;
        this._batteryItem.visible = connected;
    }

    _onStateChanged(state) {
        switch (state) {
        case ConnectionState.CONNECTING:
            this._statusItem.label.text = 'Connecting…';
            this._statusItem.show();
            break;
        case ConnectionState.CONNECTED:
            this._statusItem.hide();
            break;
        case ConnectionState.DISCONNECTED:
        case ConnectionState.ERROR:
            this._statusItem.label.text = 'Connection error — retrying…';
            this._statusItem.show();
            this._setConnectedState(false);
            this.subtitle = 'Not connected';
            this._currentAddress = null;
            break;
        }
    }

    // ── Info (active device) ────────────────────────────────────────────────

    _onInfoChanged(info) {
        if (!info || Object.keys(info).length === 0) {
            this.subtitle = this._ext.gettext('Not connected');
            this._setConnectedState(false);
            this._currentAddress = null;
            return;
        }

        this._currentAddress = info.address;
        this.title = info.name ?? 'MagicPods';
        this.subtitle = info.connected
            ? this._ext.gettext('Connected')
            : this._ext.gettext('Disconnected');

        // ANC
        const anc = info.capabilities?.anc;
        const hasAnc = anc != null && (anc.options ?? 0) > 0;
        this._ancSep.visible = hasAnc;
        this._ancItem.visible = hasAnc;
        if (hasAnc) {
            this._ancItem.remove_all_children();
            this._ancItem.add_child(makeAncBox(anc, info.address, this._backend));
        }

        // Battery
        const hasBattery = info.capabilities?.battery != null;
        this._batterySep.visible = hasBattery;
        this._batteryItem.visible = hasBattery;
        if (hasBattery) {
            this._batteryItem.remove_all_children();
            this._batteryItem.add_child(makeBatteryBox(info.capabilities.battery));
        }
    }

    // ── Device list ─────────────────────────────────────────────────────────

    _onDevicesChanged(headphones) {
        this._devicesItem.menu.removeAll();

        const connected = headphones.find(hp => hp.connected);
        this._devicesItem.label.text = connected?.name
            ?? this._ext.gettext('No device');

        if (headphones.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(
                this._ext.gettext('No supported devices found'),
                {reactive: false});
            this._devicesItem.menu.addMenuItem(empty);
            return;
        }

        for (const hp of headphones) {
            const label = hp.connected ? `${hp.name}  ✓` : hp.name;
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => {
                if (hp.connected)
                    this._backend.disconnectDevice(hp.address);
                else
                    this._backend.connectDevice(hp.address);
                this._devicesItem.menu.toggle();
            });
            this._devicesItem.menu.addMenuItem(item);
        }
    }
});

// ── System indicator ─────────────────────────────────────────────────────────

export const MagicPodsIndicator = GObject.registerClass(
class MagicPodsIndicator extends SystemIndicator {
    _init(backend, extensionObject, notifier) {
        super._init();

        // The small icon shown in the top bar when headphones are connected
        this._icon = this._addIndicator();
        this._icon.icon_name = 'audio-headset-symbolic';
        this._icon.hide();

        this._toggle = new MagicPodsToggle(backend, extensionObject, notifier);
        this.quickSettingsItems.push(this._toggle);

        this._infoId = backend.connect('info-changed', (_, json) => {
            const info = JSON.parse(json);
            const connected = info && Object.keys(info).length > 0 && info.connected;
            connected ? this._icon.show() : this._icon.hide();
        });
        this._backend = backend;
    }

    destroy() {
        this._backend.disconnect(this._infoId);
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
