// extension.js

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'; // [cite: 9]
import * as Main from 'resource:///org/gnome/shell/ui/main.js'; // [cite: 9]
import Meta from 'gi://Meta'; // [cite: 9]
import Shell from 'gi://Shell'; // [cite: 10]
import GLib from 'gi://GLib'; // [cite: 10]
import Gio from 'gi://Gio'; // [cite: 10]

import { SettingsManager } from './modules/SettingsManager.js'; // [cite: 10]
import { HighlightManager } from './modules/HighlightManager.js'; // [cite: 11]
import { WindowManager } from './modules/WindowManager.js'; // [cite: 11]
import { Indicator } from './modules/Indicator.js'; // [cite: 11]
const ENABLE_ZONING_KEY = 'enable-auto-zoning'; // [cite: 12]
const CYCLE_ACCELERATOR_KEY = 'cycle-zone-windows-accelerator'; // [cite: 12]
const CYCLE_BACKWARD_ACCELERATOR_KEY = 'cycle-zone-windows-backward-accelerator'; // [cite: 12]
const ZONE_GAP_SIZE_KEY = 'zone-gap-size'; // [cite: 12]
const TAB_BAR_HEIGHT_KEY = 'tab-bar-height'; // [cite: 12]
// New Tab Bar Adjustment Keys (ensure these match gschema and SettingsManager) // [cite: 13]
const TAB_ICON_SIZE_KEY = 'tab-icon-size'; // [cite: 13]
const TAB_CORNER_RADIUS_KEY = 'tab-corner-radius'; // [cite: 13]
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY = 'tab-close-button-icon-size'; // [cite: 14]
const TAB_SPACING_KEY = 'tab-spacing'; // [cite: 14]
const TAB_MIN_WIDTH_KEY = 'tab-min-width'; // [cite: 14]
const TAB_MAX_WIDTH_KEY = 'tab-max-width'; // [cite: 14]
const TAB_FONT_SIZE_KEY = 'tab-font-size'; // [cite: 14]
// Already existed but good to have with other tab keys // [cite: 15]

const log = msg => console.log(`[AutoZoner.Main] ${msg}`); // [cite: 15]
const SessionManagerIface = `
<node>
    <interface name="org.gnome.SessionManager">
        <signal name="Resumed" />
    </interface>
</node>`; // [cite: 16]
const SessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(SessionManagerIface); // [cite: 17]

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata); // [cite: 17]
        this._settingsManager = null; // [cite: 18]
        this._highlightManager = null; // [cite: 18]
        this._windowManager = null; // [cite: 18]
        this._indicator = null; // [cite: 18]
        this._monitorsChangedId = 0; // [cite: 18]
        this._snapOnMonitorsChangedTimeoutId = 0; // [cite: 18]
        this._zoningChangedId = 0; // [cite: 19]
        this._cycleAccelChangedId = 0; // [cite: 19]
        this._cycleBackwardAccelChangedId = 0; // [cite: 19]
        this._zoneGapChangedId = 0; // [cite: 19]
        this._tabBarHeightChangedId = 0; // [cite: 19]
        this._tabFontSizeChangedId = 0; // [cite: 19]
        // For completeness if dynamic changes are needed // [cite: 20]

        // IDs for new tab settings signals
        this._tabIconSizeChangedId = 0; // [cite: 20]
        this._tabCornerRadiusChangedId = 0; // [cite: 21]
        this._tabCloseButtonIconSizeChangedId = 0; // [cite: 21]
        this._tabSpacingChangedId = 0; // [cite: 21]
        this._tabMinWidthChangedId = 0; // [cite: 21]
        this._tabMaxWidthChangedId = 0; // [cite: 21]

        this._sessionProxy = null; // [cite: 21]
        this._sessionResumedSignalId = 0; // [cite: 22]
        this._snapOnResumeTimeoutId = 0; // [cite: 22]
    }

    _performDelayedSnap(reason = "unknown change") {
        if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) { // [cite: 22]
            log(`Re-snapping windows due to: ${reason}`); // [cite: 22]
            this._windowManager.snapAllWindowsToZones(); // [cite: 23]
        }
    }

    _updateAllTabsAppearance(reason = "unknown tab setting change") {
        log(`Updating tab appearances due to: ${reason}`); // [cite: 23]
        if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) { // [cite: 24]
            this._windowManager.updateAllTabAppearances(); // [cite: 24]
        }
    }

    enable() {
        log('Enabling…'); // [cite: 25]
        this._settingsManager = new SettingsManager(this.getSettings(), this.path); // [cite: 26]
        this._highlightManager = new HighlightManager(this._settingsManager); // [cite: 26]
        this._windowManager = new WindowManager(this._settingsManager, this._highlightManager); // [cite: 26]
        this._indicator = new Indicator(this.uuid, this._settingsManager, this); // [cite: 26]
        this._windowManager.connectSignals(); // [cite: 27]
        if (this._settingsManager.isZoningEnabled()) { // [cite: 27]
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 300, () => { // [cite: 27]
                if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) { // [cite: 27]
                    log('Performing initial snapAllWindowsToZones after delay...'); // [cite: 27]
                    this._performDelayedSnap("initial enable"); // [cite: 27]
                }
                return GLib.SOURCE_REMOVE; // [cite: 28]
            });
        }

        this._zoningChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 29]
            `changed::${ENABLE_ZONING_KEY}`, // [cite: 29]
            () => {
                this._windowManager.connectSignals(); // [cite: 29]
                if (this._settingsManager.isZoningEnabled()) { // [cite: 29]
                    // Perform a full refresh including potential splits
                    if (this._windowManager) this._windowManager.refreshZonesAndLayout(); // [cite: 30]
                } else { // [cite: 30]
                    if (this._windowManager) this._windowManager.cleanupWindowProperties(); // Clean up if disabled
                }
                this._indicator.updateToggleState(); // [cite: 30]
            }
        );
        this._zoneGapChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 31]
            `changed::${ZONE_GAP_SIZE_KEY}`, // [cite: 31]
            () => {
                log('Zone gap size setting changed; re-snapping windows...'); // [cite: 31]
                if (this._windowManager) this._windowManager._rebuildAndResnapAll(); // Full rebuild for gap changes // [cite: 31]
            }
        );
        this._tabBarHeightChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 32]
            `changed::${TAB_BAR_HEIGHT_KEY}`, // [cite: 32]
            () => {
                log('Tab bar height setting changed; re-snapping windows and updating tabs...'); // [cite: 32]
                // Snapping also updates tab bar position/size, a full rebuild is safer
                if (this._windowManager) this._windowManager._rebuildAndResnapAll(); // [cite: 32]
                this._updateAllTabsAppearance("tab bar height change"); // [cite: 32]
            }
        );
        this._tabFontSizeChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 34]
            `changed::${TAB_FONT_SIZE_KEY}`, // [cite: 34]
            () => {
                log('Tab font size setting changed; updating tabs...'); // [cite: 34]
                this._updateAllTabsAppearance("tab font size change"); // [cite: 34]
            }
        );
        // Connect signals for new tab settings // [cite: 35]
        this._tabIconSizeChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 35]
            `changed::${TAB_ICON_SIZE_KEY}`, () => this._updateAllTabsAppearance("tab icon size change") // [cite: 35]
        );
        this._tabCornerRadiusChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 36]
            `changed::${TAB_CORNER_RADIUS_KEY}`, () => this._updateAllTabsAppearance("tab corner radius change") // [cite: 36]
        );
        this._tabCloseButtonIconSizeChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 37]
            `changed::${TAB_CLOSE_BUTTON_ICON_SIZE_KEY}`, () => this._updateAllTabsAppearance("tab close button icon size change") // [cite: 37]
        );
        this._tabSpacingChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 38]
            `changed::${TAB_SPACING_KEY}`, () => this._updateAllTabsAppearance("tab spacing change") // [cite: 38]
        );
        this._tabMinWidthChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 39]
            `changed::${TAB_MIN_WIDTH_KEY}`, () => this._updateAllTabsAppearance("tab min width change") // [cite: 39]
        );
        this._tabMaxWidthChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 40]
            `changed::${TAB_MAX_WIDTH_KEY}`, () => this._updateAllTabsAppearance("tab max width change") // [cite: 40]
        );
        if (Main.layoutManager) { // [cite: 41]
            this._monitorsChangedId = Main.layoutManager.connect( // [cite: 41]
                'monitors-changed', // [cite: 41]
                () => {
                    log('Monitors changed event detected.'); // [cite: 41]
                    if (this._highlightManager) this._highlightManager.reinitHighlighters(); // [cite: 41]

                    if (this._snapOnMonitorsChangedTimeoutId > 0) { // [cite: 42]
                        GLib.Source.remove(this._snapOnMonitorsChangedTimeoutId); // [cite: 42]
                    }
                    this._snapOnMonitorsChangedTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 750, () => { // [cite: 42]
                        log('Processing monitors changed event (delayed).'); // [cite: 43]
                        if (this._windowManager) this._windowManager.refreshZonesAndLayout(); // Full refresh on monitor change // [cite: 43]
                        this._snapOnMonitorsChangedTimeoutId = 0; // [cite: 43]
                        return GLib.SOURCE_REMOVE; // [cite: 43]
                    });
                }
            );
        }

        try { // [cite: 45]
            this._sessionProxy = new SessionManagerProxy( // [cite: 45]
                Gio.DBus.session, // [cite: 45]
                'org.gnome.SessionManager', // [cite: 45]
                '/org/gnome/SessionManager', // [cite: 45]
                (proxy, error) => { // [cite: 45]
                    if (error) { // [cite: 46]
                        log(`Error creating SessionManager proxy: ${error.message}`); // [cite: 46]
                        this._sessionProxy = null; // [cite: 46]
                        return; // [cite: 46]
                    }
                    if (!this._sessionProxy) { // [cite: 47]
                        log('SessionManager proxy initialization failed silently.'); // [cite: 47]
                        return; // [cite: 47]
                    }
                    this._sessionResumedSignalId = this._sessionProxy.connectSignal('Resumed', () => { // [cite: 48]
                        log('System Resumed signal received.'); // [cite: 48]
                        if (this._snapOnResumeTimeoutId > 0) { // [cite: 48]
                            GLib.Source.remove(this._snapOnResumeTimeoutId); // [cite: 49]
                        }
                        this._snapOnResumeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 1000, () => { // [cite: 49]
                            log('Processing Resumed signal (delayed snap).'); // [cite: 49]
                            if (this._windowManager) this._windowManager.refreshZonesAndLayout(); // Full refresh on resume // [cite: 50]
                            this._snapOnResumeTimeoutId = 0; // [cite: 50]
                            return GLib.SOURCE_REMOVE; // [cite: 50]
                        });
                    });
                    log('Connected to SessionManager Resumed signal.'); // [cite: 50]
                }
            );
        } catch (e) { // [cite: 52]
            log(`Failed to create SessionManager D-Bus proxy: ${e}`); // [cite: 52]
            this._sessionProxy = null; // [cite: 53]
        }

        this._addCycleKeybinding(); // [cite: 53]
        this._addCycleBackwardKeybinding(); // [cite: 53]
        this._cycleAccelChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 54]
            `changed::${CYCLE_ACCELERATOR_KEY}`, // [cite: 54]
            () => {
                log('Cycle accelerator changed; rebinding…'); // [cite: 54]
                Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY); // [cite: 54]
                this._addCycleKeybinding(); // [cite: 54]
            }
        );
        this._cycleBackwardAccelChangedId = this._settingsManager.getGSettingObject().connect( // [cite: 55]
            `changed::${CYCLE_BACKWARD_ACCELERATOR_KEY}`, // [cite: 55]
            () => {
                log('Backward cycle accelerator changed; rebinding…'); // [cite: 55]
                Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY); // [cite: 55]
                this._addCycleBackwardKeybinding(); // [cite: 55]
            }
        );

        log('Enabled.'); // [cite: 56]
    }

    disable() {
        log('Disabling…'); // [cite: 56]
        if (this._snapOnMonitorsChangedTimeoutId > 0) { // [cite: 57]
            GLib.Source.remove(this._snapOnMonitorsChangedTimeoutId); // [cite: 57]
            this._snapOnMonitorsChangedTimeoutId = 0; // [cite: 57]
        }
        if (this._snapOnResumeTimeoutId > 0) { // [cite: 58]
            GLib.Source.remove(this._snapOnResumeTimeoutId); // [cite: 58]
            this._snapOnResumeTimeoutId = 0; // [cite: 59]
        }

        if (this._sessionProxy && this._sessionResumedSignalId > 0) { // [cite: 59]
            try { // [cite: 59]
                this._sessionProxy.disconnectSignal(this._sessionResumedSignalId); // [cite: 59]
            } catch (e) { // [cite: 60]
                log(`Error disconnecting SessionManager Resumed signal: ${e}`); // [cite: 60]
            }
            this._sessionResumedSignalId = 0; // [cite: 61]
        }
        this._sessionProxy = null; // [cite: 62]
        if (this._monitorsChangedId > 0 && Main.layoutManager) { // [cite: 63]
            Main.layoutManager.disconnect(this._monitorsChangedId); // [cite: 63]
            this._monitorsChangedId = 0; // [cite: 64]
        }
        const gsettingsObj = this._settingsManager.getGSettingObject(); // [cite: 64]
        if (this._zoningChangedId > 0) { // [cite: 65]
            gsettingsObj.disconnect(this._zoningChangedId); // [cite: 65]
            this._zoningChangedId = 0; // [cite: 65]
        }
        if (this._cycleAccelChangedId > 0) { // [cite: 66]
            gsettingsObj.disconnect(this._cycleAccelChangedId); // [cite: 66]
            this._cycleAccelChangedId = 0; // [cite: 67]
        }
        if (this._cycleBackwardAccelChangedId > 0) { // [cite: 67]
            gsettingsObj.disconnect(this._cycleBackwardAccelChangedId); // [cite: 67]
            this._cycleBackwardAccelChangedId = 0; // [cite: 68]
        }
        if (this._zoneGapChangedId > 0) { // [cite: 68]
            gsettingsObj.disconnect(this._zoneGapChangedId); // [cite: 68]
            this._zoneGapChangedId = 0; // [cite: 69]
        }
        if (this._tabBarHeightChangedId > 0) { // [cite: 69]
            gsettingsObj.disconnect(this._tabBarHeightChangedId); // [cite: 69]
            this._tabBarHeightChangedId = 0; // [cite: 70]
        }
        if (this._tabFontSizeChangedId > 0) { // [cite: 70]
            gsettingsObj.disconnect(this._tabFontSizeChangedId); // [cite: 70]
            this._tabFontSizeChangedId = 0; // [cite: 71]
        }

        // Disconnect new tab settings signals
        if (this._tabIconSizeChangedId > 0) { // [cite: 71]
            gsettingsObj.disconnect(this._tabIconSizeChangedId); // [cite: 71]
            this._tabIconSizeChangedId = 0; // [cite: 72]
        }
        if (this._tabCornerRadiusChangedId > 0) { // [cite: 72]
            gsettingsObj.disconnect(this._tabCornerRadiusChangedId); // [cite: 72]
            this._tabCornerRadiusChangedId = 0; // [cite: 73]
        }
        if (this._tabCloseButtonIconSizeChangedId > 0) { // [cite: 73]
            gsettingsObj.disconnect(this._tabCloseButtonIconSizeChangedId); // [cite: 73]
            this._tabCloseButtonIconSizeChangedId = 0; // [cite: 74]
        }
        if (this._tabSpacingChangedId > 0) { // [cite: 74]
            gsettingsObj.disconnect(this._tabSpacingChangedId); // [cite: 74]
            this._tabSpacingChangedId = 0; // [cite: 75]
        }
        if (this._tabMinWidthChangedId > 0) { // [cite: 75]
            gsettingsObj.disconnect(this._tabMinWidthChangedId); // [cite: 75]
            this._tabMinWidthChangedId = 0; // [cite: 76]
        }
        if (this._tabMaxWidthChangedId > 0) { // [cite: 76]
            gsettingsObj.disconnect(this._tabMaxWidthChangedId); // [cite: 76]
            this._tabMaxWidthChangedId = 0; // [cite: 77]
        }

        Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY); // [cite: 77]
        Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY); // [cite: 77]
        if (this._windowManager) { // [cite: 78]
            this._windowManager.cleanupWindowProperties(); // [cite: 78]
            this._windowManager.destroy(); // [cite: 78]
            this._windowManager = null; // [cite: 78]
        }
        if (this._highlightManager) { // [cite: 79]
            this._highlightManager.destroy(); // [cite: 79]
            this._highlightManager = null; // [cite: 80]
        }
        if (this._indicator) { // [cite: 80]
            this._indicator.destroy(); // [cite: 80]
            this._indicator = null; // [cite: 81]
        }
        if (this._settingsManager) { // [cite: 81]
            this._settingsManager.destroy(); // [cite: 81]
            this._settingsManager = null; // [cite: 82]
        }

        log('Disabled.'); // [cite: 82]
    }

    _addCycleKeybinding() {
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_ACCELERATOR_KEY)[0]; // [cite: 83]
        log(`Binding cycle shortcut: ${accel}`); // [cite: 84]

        Main.wm.addKeybinding( // [cite: 84]
            CYCLE_ACCELERATOR_KEY, // [cite: 84]
            this._settingsManager.getGSettingObject(), // [cite: 84]
            Meta.KeyBindingFlags.NONE, // [cite: 84]
            Shell.ActionMode.ALL, // [cite: 84]
            () => {
                log('🏷️ Cycle shortcut pressed!'); // [cite: 84]
                if (this._windowManager) this._windowManager.cycleWindowsInCurrentZone(); // [cite: 85]
            }
        );
    }

    _addCycleBackwardKeybinding() {
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY)[0]; // [cite: 86]
        log(`Binding backward cycle shortcut: ${accel}`); // [cite: 87]

        Main.wm.addKeybinding( // [cite: 87]
            CYCLE_BACKWARD_ACCELERATOR_KEY, // [cite: 87]
            this._settingsManager.getGSettingObject(), // [cite: 87]
            Meta.KeyBindingFlags.NONE, // [cite: 87]
            Shell.ActionMode.ALL, // [cite: 87]
            () => {
                log('🏷️ Backward cycle shortcut pressed!'); // [cite: 87]
                if (this._windowManager) this._windowManager.cycleWindowsInCurrentZoneBackward(); // [cite: 88]
            }
        );
    }
}
