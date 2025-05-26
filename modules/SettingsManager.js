// modules/SettingsManager.js

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
// [cite: 814]
const ZONE_SETTINGS_KEY                     = 'zones';
// [cite: 815]
const ENABLE_ZONING_KEY                     = 'enable-auto-zoning';
// [cite: 816]
const RESTORE_ON_UNTILE_KEY                 = 'restore-original-size-on-untile';
// [cite: 817]
const TILE_NEW_WINDOWS_KEY                  = 'tile-new-windows';
// [cite: 818]
const HIGHLIGHT_ON_HOVER_KEY                = 'highlight-on-hover';
// [cite: 819]
const CYCLE_ACCELERATOR_KEY                 = 'cycle-zone-windows-accelerator';
// [cite: 820]
const CYCLE_BACKWARD_ACCELERATOR_KEY        = 'cycle-zone-windows-backward-accelerator';
// [cite: 821]
const TAB_BAR_HEIGHT_KEY                    = 'tab-bar-height';
// [cite: 822]
const TAB_FONT_SIZE_KEY                     = 'tab-font-size';
// [cite: 823]
const ZONE_GAP_SIZE_KEY                     = 'zone-gap-size';
// [cite: 824]
const TAB_ICON_SIZE_KEY                     = 'tab-icon-size';
// [cite: 825]
const TAB_CORNER_RADIUS_KEY                 = 'tab-corner-radius';
// [cite: 826]
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY        = 'tab-close-button-icon-size';
// [cite: 827]
const TAB_SPACING_KEY                       = 'tab-spacing';
// [cite: 828]
const TAB_MIN_WIDTH_KEY                     = 'tab-min-width';
// [cite: 829]
const TAB_MAX_WIDTH_KEY                     = 'tab-max-width';
// [cite: 830]
const SNAP_EVASION_KEY                      = 'snap-evasion-key';
// [cite: 831]
const DEFAULT_ZONES_FILENAME                = 'default_zones.json';
// [cite: 832]
const APP_NAME_EXCEPTIONS_FILENAME          = 'app_name_exceptions.json'; // New constant

const log = (msg) => console.log(`[AutoZoner.SettingsManager] ${msg}`); //

export class SettingsManager {
    constructor(gsettings, extensionPath) {
        this._gsettings       = gsettings;
        // [cite: 833]
        this._extensionPath   = extensionPath;
        // [cite: 834]
        this._zones           = [];
        // [cite: 835]
        this._appNameExceptions = []; // New property
        this._signalHandlers  = new Map();
        // [cite: 836]

        this._loadDefaultZonesFromFileIfNeeded(); //
        this._loadZonesFromGSettings();
        // [cite: 837]
        this._loadAppNameExceptions(); // New method call

        this._connectSettingChange(ZONE_SETTINGS_KEY, () => this._loadZonesFromGSettings());
        // [cite: 838]
        this._connectSettingChange(ENABLE_ZONING_KEY, () => log('Enable auto zoning changed'));
        // [cite: 839]
        this._connectSettingChange(RESTORE_ON_UNTILE_KEY, () => log('Restore on untile changed'));
        // [cite: 840]
        this._connectSettingChange(TILE_NEW_WINDOWS_KEY, () => log('Tile new windows changed'));
        // [cite: 841]
        this._connectSettingChange(HIGHLIGHT_ON_HOVER_KEY, () => log('Highlight on hover changed'));
        // [cite: 842]
        this._connectSettingChange(CYCLE_ACCELERATOR_KEY, () => log('Cycle accelerator changed'));
        // [cite: 843]
        this._connectSettingChange(CYCLE_BACKWARD_ACCELERATOR_KEY, () => log('Backward cycle accelerator changed'));
        // [cite: 844]
        this._connectSettingChange(TAB_BAR_HEIGHT_KEY, () => log('Tab bar height changed'));
        // [cite: 845]
        this._connectSettingChange(TAB_FONT_SIZE_KEY, () => log('Tab font size changed'));
        // [cite: 846]
        this._connectSettingChange(ZONE_GAP_SIZE_KEY, () => log('Zone gap size changed'));
        // [cite: 847]
        this._connectSettingChange(TAB_ICON_SIZE_KEY, () => log('Tab icon size changed'));
        // [cite: 848]
        this._connectSettingChange(TAB_CORNER_RADIUS_KEY, () => log('Tab corner radius changed'));
        // [cite: 849]
        this._connectSettingChange(TAB_CLOSE_BUTTON_ICON_SIZE_KEY, () => log('Tab close button icon size changed'));
        // [cite: 850]
        this._connectSettingChange(TAB_SPACING_KEY, () => log('Tab spacing changed'));
        // [cite: 851]
        this._connectSettingChange(TAB_MIN_WIDTH_KEY, () => log('Tab min width changed'));
        // [cite: 852]
        this._connectSettingChange(TAB_MAX_WIDTH_KEY, () => log('Tab max width changed'));
        // [cite: 853]
        this._connectSettingChange(SNAP_EVASION_KEY, () => log(`Snap evasion key changed to: ${this.getSnapEvasionKeyName()}`));
        // [cite: 854]
    }

    _loadDefaultZonesFromFileIfNeeded() {
        log(`Attempting to load zones from ${DEFAULT_ZONES_FILENAME}…`);
        // [cite: 855]
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._extensionPath, DEFAULT_ZONES_FILENAME]));
        // [cite: 856]
        try { //
            if (file.query_exists(null)) { //
                const [ok, contents] = file.load_contents(null);
                // [cite: 857]
                if (ok) { //
                    const json = new TextDecoder().decode(contents).trim();
                    // [cite: 858]
                    if (json.startsWith('[') && json.endsWith(']')) { //
                        const current = this._gsettings.get_string(ZONE_SETTINGS_KEY);
                        // [cite: 859]
                        if (current !== json) { //
                            this._gsettings.set_string(ZONE_SETTINGS_KEY, json);
                            // [cite: 860]
                            log(`Default zones imported from file.`);
                            // [cite: 861]
                        }
                    } else { //
                        log(`Default file does not contain a JSON array.`);
                        // [cite: 862]
                    }
                } else { //
                    log(`Could not read ${DEFAULT_ZONES_FILENAME}.`);
                    // [cite: 863]
                }
            }
        } catch (e) { //
            log(`Error loading default zones: ${e}`);
            // [cite: 864]
        }
    }

    _loadZonesFromGSettings() {
        try { //
            const str = this._gsettings.get_string(ZONE_SETTINGS_KEY);
            // [cite: 865]
            const arr = JSON.parse(str);
            // [cite: 866]
            this._zones = Array.isArray(arr) ? arr : [];
            // [cite: 867]
            log(`Loaded ${this._zones.length} zones.`);
            // [cite: 868]
        } catch (e) { //
            log(`Failed to parse zones JSON: ${e}`);
            // [cite: 869]
            this._zones = [];
            // [cite: 870]
        }
    }

    // New method to load app name exceptions
    _loadAppNameExceptions() {
        log(`Attempting to load app name exceptions from ${APP_NAME_EXCEPTIONS_FILENAME}…`);
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._extensionPath, APP_NAME_EXCEPTIONS_FILENAME]));
        try {
            if (file.query_exists(null)) {
                const [ok, contents] = file.load_contents(null);
                if (ok) {
                    const json = new TextDecoder().decode(contents).trim();
                    const arr = JSON.parse(json);
                    // Store names in lowercase for case-insensitive comparison later
                    this._appNameExceptions = Array.isArray(arr) ? arr.map(name => name.toLowerCase()) : [];
                    log(`Loaded ${this._appNameExceptions.length} app name exceptions.`);
                } else {
                    log(`Could not read ${APP_NAME_EXCEPTIONS_FILENAME}.`);
                    this._appNameExceptions = [];
                }
            } else {
                log(`${APP_NAME_EXCEPTIONS_FILENAME} not found. No app name exceptions loaded.`);
                this._appNameExceptions = [];
            }
        } catch (e) {
            log(`Error loading app name exceptions: ${e}`);
            this._appNameExceptions = [];
        }
    }


    _connectSettingChange(key, callback) {
        const id = this._gsettings.connect(`changed::${key}`, callback);
        // [cite: 871]
        if (!this._signalHandlers.has(this._gsettings)) //
            this._signalHandlers.set(this._gsettings, []);
        // [cite: 872]
        this._signalHandlers.get(this._gsettings).push(id); //
    }

    getGSettingObject() {
        return this._gsettings;
        // [cite: 873]
    }

    getExtensionPath() { //
        return this._extensionPath;
        // [cite: 874]
    }

    getZones() {
        return this._zones;
        // [cite: 875]
    }

    // New getter for app name exceptions
    getAppNameExceptions() {
        return this._appNameExceptions;
    }

    isZoningEnabled() {
        return this._gsettings.get_boolean(ENABLE_ZONING_KEY);
        // [cite: 876]
    }

    isRestoreOnUntileEnabled() {
        return this._gsettings.get_boolean(RESTORE_ON_UNTILE_KEY);
        // [cite: 877]
    }

    isTileNewWindowsEnabled() {
        return this._gsettings.get_boolean(TILE_NEW_WINDOWS_KEY);
        // [cite: 878]
    }

    isHighlightOnHoverEnabled() {
        return this._gsettings.get_boolean(HIGHLIGHT_ON_HOVER_KEY);
        // [cite: 879]
    }

    get cycleZoneWindowsAccelerator() {
        const arr = this._gsettings.get_strv(CYCLE_ACCELERATOR_KEY);
        // [cite: 880]
        return arr.length > 0 ? arr[0] : '';
        // [cite: 881]
    }

    get cycleZoneWindowsBackwardAccelerator() {
        const arr = this._gsettings.get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY);
        // [cite: 882]
        return arr.length > 0 ? arr[0] : '';
        // [cite: 883]
    }

    getTabBarHeight() {
        return this._gsettings.get_int(TAB_BAR_HEIGHT_KEY);
        // [cite: 884]
    }

    getTabFontSize() {
        return this._gsettings.get_int(TAB_FONT_SIZE_KEY);
        // [cite: 885]
    }

    getZoneGapSize() {
        return this._gsettings.get_int(ZONE_GAP_SIZE_KEY);
        // [cite: 886]
    }

    getTabIconSize() {
        return this._gsettings.get_int(TAB_ICON_SIZE_KEY);
        // [cite: 887]
    }

    getTabCornerRadius() {
        return this._gsettings.get_int(TAB_CORNER_RADIUS_KEY);
        // [cite: 888]
    }

    getTabCloseButtonIconSize() {
        return this._gsettings.get_int(TAB_CLOSE_BUTTON_ICON_SIZE_KEY);
        // [cite: 889]
    }

    getTabSpacing() {
        return this._gsettings.get_int(TAB_SPACING_KEY);
        // [cite: 890]
    }

    getTabMinWidth() {
        return this._gsettings.get_int(TAB_MIN_WIDTH_KEY);
        // [cite: 891]
    }

    getTabMaxWidth() {
        return this._gsettings.get_int(TAB_MAX_WIDTH_KEY);
        // [cite: 892]
    }

    getSnapEvasionKeyName() {
        return this._gsettings.get_string(SNAP_EVASION_KEY);
        // [cite: 893]
    }

    destroy() {
        for (const [gobj, ids] of this._signalHandlers) { //
            ids.forEach(id => { //
                try { gobj.disconnect(id); } catch {} //
            });
            // [cite: 894]
        }
        this._signalHandlers.clear(); //
        log('Destroyed.');
        // [cite: 895]
    }
}
