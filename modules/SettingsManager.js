import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SCHEMA_ID                    = 'org.gnome.shell.extensions.autozoner';
const ZONE_SETTINGS_KEY           = 'zones';
const ENABLE_ZONING_KEY           = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY       = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY        = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY      = 'highlight-on-hover';
const CYCLE_ACCELERATOR_KEY       = 'cycle-zone-windows-accelerator';
const DEFAULT_ZONES_FILENAME      = 'default_zones.json';

const log = (msg) => console.log(`[AutoZoner.SettingsManager] ${msg}`);

export class SettingsManager {
    /**
     * @param {string} extensionPath  Absolute path to the extension root
     */
    constructor(extensionPath) {
        // 1) Build a schema source from our own schemas/ directory
        const schemaDir = GLib.build_filenamev([extensionPath, 'schemas']);
        const source    = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir,
            Gio.SettingsSchemaSource.get_default(),
            false
        );
        const schemaObj = source.lookup(SCHEMA_ID, false);
        if (!schemaObj)
            throw new Error(`Schema ${SCHEMA_ID} not found in ${schemaDir}`);

        // 2) Create Gio.Settings from that schema object
        this._gsettings      = new Gio.Settings({ settings_schema: schemaObj });
        this._extensionPath  = extensionPath;
        this._zones          = [];
        this._signalHandlers = new Map();

        // 3) Load defaults from file if needed, then pull zones into memory
        this._loadDefaultZonesFromFileIfNeeded();
        this._loadZonesFromGSettings();

        // 4) Watch for changes to the 'zones' and accelerator keys
        this._connectSettingChange(ZONE_SETTINGS_KEY,      () => this._loadZonesFromGSettings());
        this._connectSettingChange(CYCLE_ACCELERATOR_KEY,  () => log('Cycle accelerator changed'));
    }

    // PRIVATE

    _loadDefaultZonesFromFileIfNeeded() {
        log(`Checking for ${DEFAULT_ZONES_FILENAME} to seed GSettings…`);
        const file = Gio.File.new_for_path(
            GLib.build_filenamev([this._extensionPath, DEFAULT_ZONES_FILENAME])
        );
        try {
            if (file.query_exists(null)) {
                const [ok, contents] = file.load_contents(null);
                if (ok) {
                    const str = new TextDecoder('utf-8').decode(contents).trim();
                    if (str.startsWith('[') && str.endsWith(']')) {
                        const current = this._gsettings.get_string(ZONE_SETTINGS_KEY);
                        if (current !== str) {
                            this._gsettings.set_string(ZONE_SETTINGS_KEY, str);
                            log(`Imported zones from ${DEFAULT_ZONES_FILENAME}`);
                        } else {
                            log(`Zones already match ${DEFAULT_ZONES_FILENAME}`);
                        }
                    } else {
                        log(`Invalid JSON array in ${DEFAULT_ZONES_FILENAME}; skipping import`);
                    }
                } else {
                    log(`Failed to read ${DEFAULT_ZONES_FILENAME}; skipping import`);
                }
            } else {
                log(`${DEFAULT_ZONES_FILENAME} not present; using existing settings`);
            }
        } catch (e) {
            log(`Error loading ${DEFAULT_ZONES_FILENAME}: ${e}`);
        }
    }

    _loadZonesFromGSettings() {
        try {
            const json = this._gsettings.get_string(ZONE_SETTINGS_KEY);
            const parsed = JSON.parse(json);
            this._zones = Array.isArray(parsed) ? parsed : [];
            log(`Loaded ${this._zones.length} zones from GSettings`);
        } catch (e) {
            log(`Error parsing zones JSON: ${e}; clearing zones`);
            this._zones = [];
        }
    }

    _connectSettingChange(key, callback) {
        const id = this._gsettings.connect(`changed::${key}`, callback);
        if (!this._signalHandlers.has(this._gsettings))
            this._signalHandlers.set(this._gsettings, []);
        this._signalHandlers.get(this._gsettings).push(id);
    }

    // PUBLIC API

    /** @returns {Gio.Settings} */
    getGSettingObject() {
        return this._gsettings;
    }

    /** @returns {Array<Object>} array of zone definitions */
    getZones() {
        return this._zones;
    }

    /** @returns {boolean} */
    isZoningEnabled() {
        return this._gsettings.get_boolean(ENABLE_ZONING_KEY);
    }
    /** @returns {boolean} */
    isRestoreOnUntileEnabled() {
        return this._gsettings.get_boolean(RESTORE_ON_UNTILE_KEY);
    }
    /** @returns {boolean} */
    isTileNewWindowsEnabled() {
        return this._gsettings.get_boolean(TILE_NEW_WINDOWS_KEY);
    }
    /** @returns {boolean} */
    isHighlightOnHoverEnabled() {
        return this._gsettings.get_boolean(HIGHLIGHT_ON_HOVER_KEY);
    }
    /** @returns {string} accelerator string */
    get cycleZoneWindowsAccelerator() {
        return this._gsettings.get_string(CYCLE_ACCELERATOR_KEY);
    }

    /**
     * Convenience for other modules to listen to setting changes
     * @param {string} key
     * @param {Function} callback
     */
    connect(key, callback) {
        return this._connectSettingChange(key, callback);
    }

    /** Disconnects all signals and cleans up. */
    destroy() {
        for (const [gobj, ids] of this._signalHandlers) {
            ids.forEach(id => {
                try {
                    if (gobj.is_connected?.(id)) gobj.disconnect(id);
                    else if (gobj.disconnect)       gobj.disconnect(id);
                } catch (e) { /* ignore */ }
            });
        }
        this._signalHandlers.clear();
        log('Destroyed.');
    }
}

