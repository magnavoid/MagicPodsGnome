// backend.js — manages the magicpodscore binary and WebSocket connection
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

const WS_URL = 'ws://127.0.0.1:2020/';
const RECONNECT_DELAY_MS = 2000;
const INITIAL_CONNECT_DELAY_MS = 1500; // wait for binary to start
const SUPPORTED_API_VERSION = 0;

export const ConnectionState = Object.freeze({
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error',
});

export const Backend = GObject.registerClass({
    Signals: {
        'connection-state-changed': {param_types: [GObject.TYPE_STRING]},
        'info-changed': {param_types: [GObject.TYPE_STRING]},      // JSON string of info object
        'devices-changed': {param_types: [GObject.TYPE_STRING]},   // JSON string of headphones array
        'bluetooth-changed': {param_types: [GObject.TYPE_BOOLEAN]},
        'settings-changed': {param_types: [GObject.TYPE_STRING]},  // JSON string of settings object
    },
}, class Backend extends GObject.Object {
    _init(binaryPath) {
        super._init();
        this._binaryPath = binaryPath;
        this._process = null;
        this._session = new Soup.Session();
        this._conn = null;
        this._cancellable = null;
        this._reconnectId = 0;
        this._enabled = false;
        this._apiReady = false;
    }

    enable() {
        this._enabled = true;
        this._startProcess();
        this._scheduleConnect(INITIAL_CONNECT_DELAY_MS);
    }

    disable() {
        this._enabled = false;
        this._clearReconnect();
        this._wsDisconnect();
        this._stopProcess();
    }

    // ── Process management ──────────────────────────────────────────────────

    _startProcess() {
        if (this._process !== null) return;

        if (!GLib.file_test(this._binaryPath, GLib.FileTest.EXISTS)) {
            console.error(`[MagicPods] binary not found: ${this._binaryPath}`);
            return;
        }

        try {
            this._process = Gio.Subprocess.new(
                [this._binaryPath],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            this._process.wait_async(null, this._onProcessExited.bind(this));
        } catch (e) {
            console.error(`[MagicPods] failed to start binary: ${e.message}`);
            this._process = null;
        }
    }

    _onProcessExited(_process, _result) {
        this._process = null;
        if (!this._enabled) return;
        console.warn('[MagicPods] binary exited unexpectedly, restarting');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (this._enabled) this._startProcess();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopProcess() {
        if (this._process) {
            try { this._process.force_exit(); } catch (_e) {}
            this._process = null;
        }
    }

    // ── WebSocket connection ────────────────────────────────────────────────

    _scheduleConnect(delay = RECONNECT_DELAY_MS) {
        this._clearReconnect();
        this._reconnectId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._reconnectId = 0;
            if (this._enabled) this._wsConnect();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearReconnect() {
        if (this._reconnectId) {
            GLib.source_remove(this._reconnectId);
            this._reconnectId = 0;
        }
    }

    _wsConnect() {
        this._wsDisconnect();
        this._apiReady = false;
        this.emit('connection-state-changed', ConnectionState.CONNECTING);

        const msg = Soup.Message.new('GET', WS_URL);
        this._cancellable = new Gio.Cancellable();

        this._session.websocket_connect_async(
            msg, null, [], GLib.PRIORITY_DEFAULT,
            this._cancellable,
            this._onWsConnected.bind(this)
        );
    }

    _onWsConnected(session, result) {
        try {
            this._conn = session.websocket_connect_finish(result);
        } catch (e) {
            if (!this._enabled) return;
            this.emit('connection-state-changed', ConnectionState.ERROR);
            this._scheduleConnect();
            return;
        }

        this._conn.connect('message', this._onWsMessage.bind(this));
        this._conn.connect('closed', this._onWsClosed.bind(this));
        this._conn.connect('error', (_conn, error) => {
            console.error(`[MagicPods] WebSocket error: ${error.message}`);
        });
    }

    _onWsMessage(_conn, type, data) {
        if (type !== Soup.WebsocketDataType.TEXT) return;

        let json;
        try {
            const text = new TextDecoder().decode(data.get_data());
            json = JSON.parse(text);
        } catch (_e) {
            return;
        }

        // Wait for init handshake
        if (!this._apiReady) {
            if (json?.init?.api == null) return;
            if (json.init.api !== SUPPORTED_API_VERSION) {
                console.error(`[MagicPods] unsupported API version: ${json.init.api}`);
                this.emit('connection-state-changed', ConnectionState.ERROR);
                return;
            }
            this._apiReady = true;
            this.emit('connection-state-changed', ConnectionState.CONNECTED);
            this._send({method: 'GetAll'});
            return;
        }

        if (json.info !== undefined)
            this.emit('info-changed', JSON.stringify(json.info));
        if (json.headphones !== undefined)
            this.emit('devices-changed', JSON.stringify(json.headphones));
        if (json.defaultbluetooth !== undefined)
            this.emit('bluetooth-changed', json.defaultbluetooth.enabled === true);
        if (json.settings !== undefined)
            this.emit('settings-changed', JSON.stringify(json.settings));
    }

    _onWsClosed() {
        this._conn = null;
        this._apiReady = false;
        if (!this._enabled) return;
        this.emit('connection-state-changed', ConnectionState.DISCONNECTED);
        this._scheduleConnect();
    }

    _wsDisconnect() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
        if (this._conn) {
            try { this._conn.close(Soup.WebsocketCloseCode.NORMAL, null); } catch (_e) {}
            this._conn = null;
        }
        this._apiReady = false;
    }

    _send(json) {
        if (!this._conn) return;
        if (this._conn.get_state() !== Soup.WebsocketState.OPEN) return;
        try {
            this._conn.send_text(JSON.stringify(json));
        } catch (e) {
            console.error(`[MagicPods] send failed: ${e.message}`);
        }
    }

    // ── Public API ──────────────────────────────────────────────────────────

    connectDevice(address) {
        this._send({method: 'ConnectDevice', arguments: {address}});
    }

    disconnectDevice(address) {
        this._send({method: 'DisconnectDevice', arguments: {address}});
    }

    setAnc(address, value) {
        this._send({
            method: 'SetCapabilities',
            arguments: {address, capabilities: {anc: {selected: value}}},
        });
    }

    setCapability(address, capability, value) {
        this._send({
            method: 'SetCapabilities',
            arguments: {address, capabilities: {[capability]: {selected: value}}},
        });
    }

    getSetting(container, setting) {
        this._send({method: 'GetSetting', arguments: {container, setting}});
    }

    setSetting(container, setting, value) {
        this._send({method: 'SetSetting', arguments: {container, setting, value}});
    }

    enableBluetooth() {
        this._send({method: 'EnableDefaultBluetoothAdapter'});
    }

    disableBluetooth() {
        this._send({method: 'DisableDefaultBluetoothAdapter'});
    }
});
