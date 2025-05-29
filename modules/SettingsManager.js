// modules/SettingsManager.js

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const ZONE_SETTINGS_KEY                     = 'zones';
const ENABLE_ZONING_KEY                     = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY                 = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY                  = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY                = 'highlight-on-hover';
const CYCLE_ACCELERATOR_KEY                 = 'cycle-zone-windows-accelerator';
const CYCLE_BACKWARD_ACCELERATOR_KEY        = 'cycle-zone-windows-backward-accelerator';
const TAB_BAR_HEIGHT_KEY                    = 'tab-bar-height';
const TAB_FONT_SIZE_KEY                     = 'tab-font-size';
const ZONE_GAP_SIZE_KEY                     = 'zone-gap-size';
const TAB_ICON_SIZE_KEY                     = 'tab-icon-size';
const TAB_CORNER_RADIUS_KEY                 = 'tab-corner-radius';
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY        = 'tab-close-button-icon-size';
const TAB_SPACING_KEY                       = 'tab-spacing';
const TAB_MIN_WIDTH_KEY                     = 'tab-min-width';
const TAB_MAX_WIDTH_KEY                     = 'tab-max-width';
const SNAP_EVASION_KEY                      = 'snap-evasion-key';
const APP_NAME_EXCEPTIONS_KEY               = 'app-name-exceptions';
const DEFAULT_ZONES_FILENAME                = 'default_zones.json';
const APP_NAME_EXCEPTIONS_FILENAME          = 'app_name_exceptions.json'; // Keep for potential migration
const log = (msg) => console.log(`[AutoZoner.SettingsManager] ${msg}`); 

export class SettingsManager {
    constructor(gsettings, extensionPath) {
        this._gsettings       = gsettings;
        this._extensionPath   = extensionPath;
        this._zones           = [];
        this._appNameExceptions = []; // Now stores {appId: string, wordCount: number}
        this._signalHandlers  = new Map();
        this._loadDefaultZonesFromFileIfNeeded(); 
        this._loadZonesFromGSettings();
        this._migrateAppNameExceptionsFromFile(); // One-time migration from old JSON file
        this._loadAppNameExceptionsFromGSettings();
        this._connectSettingChange(ZONE_SETTINGS_KEY, () => this._loadZonesFromGSettings());
        this._connectSettingChange(APP_NAME_EXCEPTIONS_KEY, () => this._loadAppNameExceptionsFromGSettings());
        this._connectSettingChange(ENABLE_ZONING_KEY, () => log('Enable auto zoning changed'));
        this._connectSettingChange(RESTORE_ON_UNTILE_KEY, () => log('Restore on untile changed'));
        this._connectSettingChange(TILE_NEW_WINDOWS_KEY, () => log('Tile new windows changed'));
        this._connectSettingChange(HIGHLIGHT_ON_HOVER_KEY, () => log('Highlight on hover changed'));
        this._connectSettingChange(CYCLE_ACCELERATOR_KEY, () => log('Cycle accelerator changed'));
        this._connectSettingChange(CYCLE_BACKWARD_ACCELERATOR_KEY, () => log('Backward cycle accelerator changed'));
        this._connectSettingChange(TAB_BAR_HEIGHT_KEY, () => log('Tab bar height changed'));
        this._connectSettingChange(TAB_FONT_SIZE_KEY, () => log('Tab font size changed'));
        
        this._connectSettingChange(ZONE_GAP_SIZE_KEY, () => log('Zone gap size changed'));
        
        this._connectSettingChange(TAB_ICON_SIZE_KEY, () => log('Tab icon size changed'));
        
        this._connectSettingChange(TAB_CORNER_RADIUS_KEY, () => log('Tab corner radius changed'));
        
        this._connectSettingChange(TAB_CLOSE_BUTTON_ICON_SIZE_KEY, () => log('Tab close button icon size changed'));
        
        this._connectSettingChange(TAB_SPACING_KEY, () => log('Tab spacing changed'));
        
        this._connectSettingChange(TAB_MIN_WIDTH_KEY, () => log('Tab min width changed'));
        
        this._connectSettingChange(TAB_MAX_WIDTH_KEY, () => log('Tab max width changed'));
        
        this._connectSettingChange(SNAP_EVASION_KEY, () => log(`Snap evasion key changed to: ${this.getSnapEvasionKeyName()}`));
        
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

    // One-time migration from old JSON file to GSettings
    _migrateAppNameExceptionsFromFile() {
        const currentExceptions = this._gsettings.get_string(APP_NAME_EXCEPTIONS_KEY);
        if (currentExceptions && currentExceptions !== '[]') {
            log('App name exceptions already exist in GSettings, skipping migration.');
            return;
        }

        log(`Attempting to migrate app name exceptions from ${APP_NAME_EXCEPTIONS_FILENAME}…`);
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._extensionPath, APP_NAME_EXCEPTIONS_FILENAME]));
        try {
            if (file.query_exists(null)) {
                const [ok, contents] = file.load_contents(null);
                if (ok) {
                    const json = new TextDecoder().decode(contents).trim();
                    const oldExceptions = JSON.parse(json);
                    if (Array.isArray(oldExceptions)) {
                        // Convert old format to new format with default word count of 1
                        const newExceptions = oldExceptions.map(appId => ({
                            appId: appId,
                            wordCount: 1
                        }));
                        this._gsettings.set_string(APP_NAME_EXCEPTIONS_KEY, JSON.stringify(newExceptions));
                        log(`Migrated ${newExceptions.length} app name exceptions from file to GSettings.`);
                    }
                }
            }
        } catch (e) {
            log(`Error migrating app name exceptions: ${e}`);
        }
    }

    _loadAppNameExceptionsFromGSettings() {
        try {
            const str = this._gsettings.get_string(APP_NAME_EXCEPTIONS_KEY);
            const arr = JSON.parse(str);
            
            if (Array.isArray(arr)) {
                // Validate format and ensure each entry has required fields
                this._appNameExceptions = arr.filter(item => 
                    item && 
                    typeof item.appId === 'string' && 
                    typeof item.wordCount === 'number' && 
                    item.wordCount > 0
                ).map(item => ({
                    appId: item.appId.toLowerCase(), // Store in lowercase for comparison
                    wordCount: Math.max(1, Math.floor(item.wordCount)) // Ensure positive integer
                }));
            } else {
                this._appNameExceptions = [];
            }
            
            log(`Loaded ${this._appNameExceptions.length} app name exceptions from GSettings.`);
        } catch (e) {
            log(`Failed to parse app name exceptions JSON: ${e}`);
            this._appNameExceptions = [];
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

    getExtensionPath() { 
        return this._extensionPath;
        
    }

    getZones() {
        return this._zones;
        
    }

    // Updated getter returns the full exception objects
    getAppNameExceptions() {
        return this._appNameExceptions;
    }

    // Helper method to get word count for a specific app ID
    getAppNameExceptionWordCount(appId) {
        if (!appId) return null;
        const exception = this._appNameExceptions.find(ex => ex.appId === appId.toLowerCase());
        return exception ? exception.wordCount : null;
    }

    // Helper method to check if an app ID is in exceptions
    isAppNameException(appId) {
        if (!appId) return false;
        return this._appNameExceptions.some(ex => ex.appId === appId.toLowerCase());
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

    getTabBarHeight() {
        return this._gsettings.get_int(TAB_BAR_HEIGHT_KEY);
        
    }

    getTabFontSize() {
        return this._gsettings.get_int(TAB_FONT_SIZE_KEY);
        
    }

    getZoneGapSize() {
        return this._gsettings.get_int(ZONE_GAP_SIZE_KEY);
        
    }

    getTabIconSize() {
        return this._gsettings.get_int(TAB_ICON_SIZE_KEY);
        
    }

    getTabCornerRadius() {
        return this._gsettings.get_int(TAB_CORNER_RADIUS_KEY);
        
    }

    getTabCloseButtonIconSize() {
        return this._gsettings.get_int(TAB_CLOSE_BUTTON_ICON_SIZE_KEY);
        
    }

    getTabSpacing() {
        return this._gsettings.get_int(TAB_SPACING_KEY);
        
    }

    getTabMinWidth() {
        return this._gsettings.get_int(TAB_MIN_WIDTH_KEY);
        
    }

    getTabMaxWidth() {
        return this._gsettings.get_int(TAB_MAX_WIDTH_KEY);
        
    }

    getSnapEvasionKeyName() {
        return this._gsettings.get_string(SNAP_EVASION_KEY);
        
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
