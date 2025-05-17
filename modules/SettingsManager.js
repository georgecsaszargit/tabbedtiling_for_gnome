import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const ZONE_SETTINGS_KEY = 'zones';
const ENABLE_ZONING_KEY = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY = 'highlight-on-hover';
const DEFAULT_ZONES_FILENAME = 'default_zones.json';

const log = (msg) => console.log(`[AutoZoner.SettingsManager] ${msg}`);

export class SettingsManager {
    constructor(gsettings, extensionPath) {
        this._gsettings = gsettings;
        this._extensionPath = extensionPath;
        this._zones = [];
        this._signalHandlers = new Map();

        this._loadDefaultZonesFromFileIfNeeded();
        this._loadZonesFromGSettings(); // Initial load

        this._connectSettingChange(ZONE_SETTINGS_KEY, () => this._loadZonesFromGSettings());
    }

    _loadDefaultZonesFromFileIfNeeded() {
        log(`Attempting to load zones from ${DEFAULT_ZONES_FILENAME} to update GSettings on enable.`);
        const defaultZonesFile = Gio.File.new_for_path(GLib.build_filenamev([this._extensionPath, DEFAULT_ZONES_FILENAME]));

        try {
            if (defaultZonesFile.query_exists(null)) {
                const [success, contents] = defaultZonesFile.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const newZonesStringFromFile = decoder.decode(contents);
                    if (newZonesStringFromFile.trim().startsWith('[') && newZonesStringFromFile.trim().endsWith(']')) {
                        const currentGSettingsZones = this._gsettings.get_string(ZONE_SETTINGS_KEY);
                        if (currentGSettingsZones !== newZonesStringFromFile) {
                            this._gsettings.set_string(ZONE_SETTINGS_KEY, newZonesStringFromFile);
                            log(`Updated GSettings for 'zones' from ${DEFAULT_ZONES_FILENAME}.`);
                        } else {
                            log(`GSettings for 'zones' already matches ${DEFAULT_ZONES_FILENAME}. No update needed.`);
                        }
                    } else {
                        log(`Error: Content of ${DEFAULT_ZONES_FILENAME} does not appear to be a valid JSON array string. GSettings not updated from file.`);
                    }
                } else {
                    log(`Error: Could not load contents of ${DEFAULT_ZONES_FILENAME}. GSettings not updated from file.`);
                }
            } else {
                 log(`Info: ${DEFAULT_ZONES_FILENAME} does not exist at path: ${defaultZonesFile.get_path()}. Using current GSettings for 'zones'.`);
            }
        } catch (e) {
            log(`Error processing ${DEFAULT_ZONES_FILENAME}: ${e}. Using current GSettings for 'zones'.`);
        }
    }

    _loadZonesFromGSettings() {
        try {
            const zonesJson = this._gsettings.get_string(ZONE_SETTINGS_KEY);
            this._zones = JSON.parse(zonesJson);
            if (!Array.isArray(this._zones)) {
                this._zones = [];
                log("Error: Zones GSetting is not an array. Reverting to empty.");
            }
            log(`Loaded ${this._zones.length} zones from GSettings.`);
            // Optionally, emit a signal here if other modules need to react to zone reloads
            // this.emit('zones-updated');
        } catch (e) {
            log(`Error parsing zones JSON from GSettings: ${e}. Using empty zones array.`);
            this._zones = [];
        }
    }

    _connectSettingChange(key, callback) {
        const id = this._gsettings.connect(`changed::${key}`, callback);
        if (!this._signalHandlers.has(this._gsettings)) {
            this._signalHandlers.set(this._gsettings, []);
        }
        this._signalHandlers.get(this._gsettings).push(id);
    }

    getGSettingObject() {
        return this._gsettings;
    }

    getZones() {
        return this._zones; // Returns the cached array
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

    connect(key, callback) { // Convenience for other modules to listen to setting changes
        return this._connectSettingChange(key, callback);
    }

    destroy() {
        this._signalHandlers.forEach((ids, gobject) => {
            ids.forEach(id => {
                 try {
                    if (gobject.is_connected && gobject.is_connected(id)) {
                        gobject.disconnect(id);
                    } else if (gobject.disconnect && typeof gobject.disconnect === 'function') {
                         gobject.disconnect(id);
                    }
                } catch (e) { /* ignore */ }
            });
        });
        this._signalHandlers.clear();
        log("Destroyed.");
    }
}
