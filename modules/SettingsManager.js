// modules/SettingsManager.js

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const ZONE_SETTINGS_KEY                  = 'zones';
const ENABLE_ZONING_KEY                  = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY              = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY               = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY             = 'highlight-on-hover';
const CYCLE_ACCELERATOR_KEY              = 'cycle-zone-windows-accelerator';
const CYCLE_BACKWARD_ACCELERATOR_KEY     = 'cycle-zone-windows-backward-accelerator';

// New tab bar settings keys
const TAB_BAR_HEIGHT_KEY                 = 'tab-bar-height';
const TAB_FONT_SIZE_KEY                  = 'tab-font-size';

const DEFAULT_ZONES_FILENAME             = 'default_zones.json';

const log = (msg) => console.log(`[AutoZoner.SettingsManager] ${msg}`);

export class SettingsManager {
    constructor(gsettings, extensionPath) {
        this._gsettings       = gsettings;
        this._extensionPath   = extensionPath;
        this._zones           = [];
        this._signalHandlers  = new Map();

        this._loadDefaultZonesFromFileIfNeeded();
        this._loadZonesFromGSettings();

        this._connectSettingChange(ZONE_SETTINGS_KEY, () => this._loadZonesFromGSettings());
        this._connectSettingChange(CYCLE_ACCELERATOR_KEY, () => log('Cycle accelerator changed'));
        this._connectSettingChange(CYCLE_BACKWARD_ACCELERATOR_KEY, () => log('Backward cycle accelerator changed'));
        this._connectSettingChange(TAB_BAR_HEIGHT_KEY, () => log('Tab bar height changed'));
        this._connectSettingChange(TAB_FONT_SIZE_KEY, () => log('Tab font size changed'));
    }

    _loadDefaultZonesFromFileIfNeeded() {
        log(`Attempting to load zones from ${DEFAULT_ZONES_FILENAME}…`);
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._extensionPath, DEFAULT_ZONES_FILENAME]));
        try {
            if (file.query_exists(null)) {
                const [ok, contents] = file.load_contents(null);
                if (ok) {
                    const json = new TextDecoder().decode(contents).trim();
                    if (json.startsWith('[') && json.endsWith(']')) {
                        const current = this._gsettings.get_string(ZONE_SETTINGS_KEY);
                        if (current !== json) {
                            this._gsettings.set_string(ZONE_SETTINGS_KEY, json);
                            log(`Default zones imported from file.`);
                        }
                    } else {
                        log(`Default file does not contain a JSON array.`);
                    }
                } else {
                    log(`Could not read ${DEFAULT_ZONES_FILENAME}.`);
                }
            }
        } catch (e) {
            log(`Error loading default zones: ${e}`);
        }
    }

    _loadZonesFromGSettings() {
        try {
            const str = this._gsettings.get_string(ZONE_SETTINGS_KEY);
            const arr = JSON.parse(str);
            this._zones = Array.isArray(arr) ? arr : [];
            log(`Loaded ${this._zones.length} zones.`);
        } catch (e) {
            log(`Failed to parse zones JSON: ${e}`);
            this._zones = [];
        }
    }

    _connectSettingChange(key, callback) {
        const id = this._gsettings.connect(`changed::${key}`, callback);
        if (!this._signalHandlers.has(this._gsettings))
            this._signalHandlers.set(this._gsettings, []);
        this._signalHandlers.get(this._gsettings).push(id);
    }

    getGSettingObject() {
        return this._gsettings;
    }

    getZones() {
        return this._zones;
    }

    isZoningEnabled() {
        return this._gsettings.get_boolean(ENABLE_ZONING_KEY);
    }

    isRestoreOnUntileEnabled() {
        return this._gsettings.get_boolean(RESTORE_ON_UNTILE_KEY);
    }

    isTileNewWindowsEnabled() {
        return this._gsettings.get_boolean(TILE_NEW_WINDOWS_KEY);
    }

    isHighlightOnHoverEnabled() {
        return this._gsettings.get_boolean(HIGHLIGHT_ON_HOVER_KEY);
    }

    get cycleZoneWindowsAccelerator() {
        const arr = this._gsettings.get_strv(CYCLE_ACCELERATOR_KEY);
        return arr.length > 0 ? arr[0] : '';
    }

    get cycleZoneWindowsBackwardAccelerator() {
        const arr = this._gsettings.get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY);
        return arr.length > 0 ? arr[0] : '';
    }

    // New getters for tab bar settings
    getTabBarHeight() {
        return this._gsettings.get_int(TAB_BAR_HEIGHT_KEY);
    }

    getTabFontSize() {
        return this._gsettings.get_int(TAB_FONT_SIZE_KEY);
    }

    destroy() {
        for (const [gobj, ids] of this._signalHandlers) {
            ids.forEach(id => {
                try { gobj.disconnect(id); } catch {}
            });
        }
        this._signalHandlers.clear();
        log('Destroyed.');
    }
}

