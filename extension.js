// extension.js

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'; 
import * as Main from 'resource:///org/gnome/shell/ui/main.js'; 
import Meta from 'gi://Meta'; 
import Shell from 'gi://Shell'; 
import GLib from 'gi://GLib'; 
import Gio from 'gi://Gio'; 

import { SettingsManager } from './modules/SettingsManager.js'; 
import { HighlightManager } from './modules/HighlightManager.js'; 
import { WindowManager } from './modules/WindowManager.js'; 
import { Indicator } from './modules/Indicator.js'; 
const ENABLE_ZONING_KEY = 'enable-auto-zoning'; 
const CYCLE_ACCELERATOR_KEY = 'cycle-zone-windows-accelerator'; 
const CYCLE_BACKWARD_ACCELERATOR_KEY = 'cycle-zone-windows-backward-accelerator'; 
const ZONE_GAP_SIZE_KEY = 'zone-gap-size'; 
const TAB_BAR_HEIGHT_KEY = 'tab-bar-height'; 
// New Tab Bar Adjustment Keys (ensure these match gschema and SettingsManager) 
const TAB_ICON_SIZE_KEY = 'tab-icon-size'; 
const TAB_CORNER_RADIUS_KEY = 'tab-corner-radius'; 
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY = 'tab-close-button-icon-size'; 
const TAB_SPACING_KEY = 'tab-spacing'; 
const TAB_MIN_WIDTH_KEY = 'tab-min-width'; 
const TAB_MAX_WIDTH_KEY = 'tab-max-width'; 
const TAB_FONT_SIZE_KEY = 'tab-font-size'; 
// Already existed but good to have with other tab keys 

const log = msg => console.log(`[AutoZoner.Main] ${msg}`); 
const SessionManagerIface = `
<node>
    <interface name="org.gnome.SessionManager">
        <signal name="Resumed" />
    </interface>
</node>`; 
const SessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(SessionManagerIface); 

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata); 
        this._settingsManager = null; 
        this._highlightManager = null; 
        this._windowManager = null; 
        this._indicator = null; 
        this._monitorsChangedId = 0; 
        this._snapOnMonitorsChangedTimeoutId = 0; 
        this._zoningChangedId = 0; 
        this._cycleAccelChangedId = 0; 
        this._cycleBackwardAccelChangedId = 0; 
        this._zoneGapChangedId = 0; 
        this._tabBarHeightChangedId = 0; 
        this._tabFontSizeChangedId = 0; 
        // For completeness if dynamic changes are needed 

        // IDs for new tab settings signals
        this._tabIconSizeChangedId = 0; 
        this._tabCornerRadiusChangedId = 0; 
        this._tabCloseButtonIconSizeChangedId = 0; 
        this._tabSpacingChangedId = 0; 
        this._tabMinWidthChangedId = 0; 
        this._tabMaxWidthChangedId = 0; 

        this._sessionProxy = null; 
        this._sessionResumedSignalId = 0; 
        this._snapOnResumeTimeoutId = 0; 
    }

    _performDelayedSnap(reason = "unknown change") {
        if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) { 
            log(`Re-snapping windows due to: ${reason}`); 
            this._windowManager.snapAllWindowsToZones(); 
        }
    }

    _updateAllTabsAppearance(reason = "unknown tab setting change") {
        log(`Updating tab appearances due to: ${reason}`); 
        if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) { 
            this._windowManager.updateAllTabAppearances(); 
        }
    }

    enable() {
        log('Enabling…'); 
        this._settingsManager = new SettingsManager(this.getSettings(), this.path); 
        this._highlightManager = new HighlightManager(this._settingsManager); 
        this._windowManager = new WindowManager(this._settingsManager, this._highlightManager); 
        this._indicator = new Indicator(this.uuid, this._settingsManager, this); 
        this._windowManager.connectSignals(); 
        if (this._settingsManager.isZoningEnabled()) { 
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 300, () => { 
                if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) { 
                    log('Performing initial snapAllWindowsToZones after delay...'); 
                    this._performDelayedSnap("initial enable"); 
                }
                return GLib.SOURCE_REMOVE; 
            });
        }

        this._zoningChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${ENABLE_ZONING_KEY}`, 
            () => {
                this._windowManager.connectSignals(); 
                if (this._settingsManager.isZoningEnabled()) { 
                    // Perform a full refresh including potential splits
                    if (this._windowManager) this._windowManager.refreshZonesAndLayout(); 
                } else { 
                    if (this._windowManager) this._windowManager.cleanupWindowProperties(); // Clean up if disabled
                }
                this._indicator.updateToggleState(); 
            }
        );
        this._zoneGapChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${ZONE_GAP_SIZE_KEY}`, 
            () => {
                log('Zone gap size setting changed; re-snapping windows...'); 
                if (this._windowManager) this._windowManager._rebuildAndResnapAll(); // Full rebuild for gap changes 
            }
        );
        this._tabBarHeightChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_BAR_HEIGHT_KEY}`, 
            () => {
                log('Tab bar height setting changed; re-snapping windows and updating tabs...'); 
                // Snapping also updates tab bar position/size, a full rebuild is safer
                if (this._windowManager) this._windowManager._rebuildAndResnapAll(); 
                this._updateAllTabsAppearance("tab bar height change"); 
            }
        );
        this._tabFontSizeChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_FONT_SIZE_KEY}`, 
            () => {
                log('Tab font size setting changed; updating tabs...'); 
                this._updateAllTabsAppearance("tab font size change"); 
            }
        );
        // Connect signals for new tab settings 
        this._tabIconSizeChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_ICON_SIZE_KEY}`, () => this._updateAllTabsAppearance("tab icon size change") 
        );
        this._tabCornerRadiusChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_CORNER_RADIUS_KEY}`, () => this._updateAllTabsAppearance("tab corner radius change") 
        );
        this._tabCloseButtonIconSizeChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_CLOSE_BUTTON_ICON_SIZE_KEY}`, () => this._updateAllTabsAppearance("tab close button icon size change") 
        );
        this._tabSpacingChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_SPACING_KEY}`, () => this._updateAllTabsAppearance("tab spacing change") 
        );
        this._tabMinWidthChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_MIN_WIDTH_KEY}`, () => this._updateAllTabsAppearance("tab min width change") 
        );
        this._tabMaxWidthChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${TAB_MAX_WIDTH_KEY}`, () => this._updateAllTabsAppearance("tab max width change") 
        );
        if (Main.layoutManager) { 
            this._monitorsChangedId = Main.layoutManager.connect( 
                'monitors-changed', 
                () => {
                    log('Monitors changed event detected.'); 
                    if (this._highlightManager) this._highlightManager.reinitHighlighters(); 

                    if (this._snapOnMonitorsChangedTimeoutId > 0) { 
                        GLib.Source.remove(this._snapOnMonitorsChangedTimeoutId); 
                    }
                    this._snapOnMonitorsChangedTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 750, () => { 
                        log('Processing monitors changed event (delayed).'); 
                        if (this._windowManager) this._windowManager.refreshZonesAndLayout(); // Full refresh on monitor change 
                        this._snapOnMonitorsChangedTimeoutId = 0; 
                        return GLib.SOURCE_REMOVE; 
                    });
                }
            );
        }

        try { 
            this._sessionProxy = new SessionManagerProxy( 
                Gio.DBus.session, 
                'org.gnome.SessionManager', 
                '/org/gnome/SessionManager', 
                (proxy, error) => { 
                    if (error) { 
                        log(`Error creating SessionManager proxy: ${error.message}`); 
                        this._sessionProxy = null; 
                        return; 
                    }
                    if (!this._sessionProxy) { 
                        log('SessionManager proxy initialization failed silently.'); 
                        return; 
                    }
                    this._sessionResumedSignalId = this._sessionProxy.connectSignal('Resumed', () => { 
                        log('System Resumed signal received.'); 
                        if (this._snapOnResumeTimeoutId > 0) { 
                            GLib.Source.remove(this._snapOnResumeTimeoutId); 
                        }
                        this._snapOnResumeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 1000, () => { 
                            log('Processing Resumed signal (delayed snap).'); 
                            if (this._windowManager) this._windowManager.refreshZonesAndLayout(); // Full refresh on resume 
                            this._snapOnResumeTimeoutId = 0; 
                            return GLib.SOURCE_REMOVE; 
                        });
                    });
                    log('Connected to SessionManager Resumed signal.'); 
                }
            );
        } catch (e) { 
            log(`Failed to create SessionManager D-Bus proxy: ${e}`); 
            this._sessionProxy = null; 
        }

        this._addCycleKeybinding(); 
        this._addCycleBackwardKeybinding(); 
        this._cycleAccelChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${CYCLE_ACCELERATOR_KEY}`, 
            () => {
                log('Cycle accelerator changed; rebinding…'); 
                Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY); 
                this._addCycleKeybinding(); 
            }
        );
        this._cycleBackwardAccelChangedId = this._settingsManager.getGSettingObject().connect( 
            `changed::${CYCLE_BACKWARD_ACCELERATOR_KEY}`, 
            () => {
                log('Backward cycle accelerator changed; rebinding…'); 
                Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY); 
                this._addCycleBackwardKeybinding(); 
            }
        );

        log('Enabled.'); 
    }

    disable() {
        log('Disabling…'); 
        if (this._snapOnMonitorsChangedTimeoutId > 0) { 
            GLib.Source.remove(this._snapOnMonitorsChangedTimeoutId); 
            this._snapOnMonitorsChangedTimeoutId = 0; 
        }
        if (this._snapOnResumeTimeoutId > 0) { 
            GLib.Source.remove(this._snapOnResumeTimeoutId); 
            this._snapOnResumeTimeoutId = 0; 
        }

        if (this._sessionProxy && this._sessionResumedSignalId > 0) { 
            try { 
                this._sessionProxy.disconnectSignal(this._sessionResumedSignalId); 
            } catch (e) { 
                log(`Error disconnecting SessionManager Resumed signal: ${e}`); 
            }
            this._sessionResumedSignalId = 0; 
        }
        this._sessionProxy = null; 
        if (this._monitorsChangedId > 0 && Main.layoutManager) { 
            Main.layoutManager.disconnect(this._monitorsChangedId); 
            this._monitorsChangedId = 0; 
        }
        const gsettingsObj = this._settingsManager.getGSettingObject(); 
        if (this._zoningChangedId > 0) { 
            gsettingsObj.disconnect(this._zoningChangedId); 
            this._zoningChangedId = 0; 
        }
        if (this._cycleAccelChangedId > 0) { 
            gsettingsObj.disconnect(this._cycleAccelChangedId); 
            this._cycleAccelChangedId = 0; 
        }
        if (this._cycleBackwardAccelChangedId > 0) { 
            gsettingsObj.disconnect(this._cycleBackwardAccelChangedId); 
            this._cycleBackwardAccelChangedId = 0; 
        }
        if (this._zoneGapChangedId > 0) { 
            gsettingsObj.disconnect(this._zoneGapChangedId); 
            this._zoneGapChangedId = 0; 
        }
        if (this._tabBarHeightChangedId > 0) { 
            gsettingsObj.disconnect(this._tabBarHeightChangedId); 
            this._tabBarHeightChangedId = 0; 
        }
        if (this._tabFontSizeChangedId > 0) { 
            gsettingsObj.disconnect(this._tabFontSizeChangedId); 
            this._tabFontSizeChangedId = 0; 
        }

        // Disconnect new tab settings signals
        if (this._tabIconSizeChangedId > 0) { 
            gsettingsObj.disconnect(this._tabIconSizeChangedId); 
            this._tabIconSizeChangedId = 0; 
        }
        if (this._tabCornerRadiusChangedId > 0) { 
            gsettingsObj.disconnect(this._tabCornerRadiusChangedId); 
            this._tabCornerRadiusChangedId = 0; 
        }
        if (this._tabCloseButtonIconSizeChangedId > 0) { 
            gsettingsObj.disconnect(this._tabCloseButtonIconSizeChangedId); 
            this._tabCloseButtonIconSizeChangedId = 0; 
        }
        if (this._tabSpacingChangedId > 0) { 
            gsettingsObj.disconnect(this._tabSpacingChangedId); 
            this._tabSpacingChangedId = 0; 
        }
        if (this._tabMinWidthChangedId > 0) { 
            gsettingsObj.disconnect(this._tabMinWidthChangedId); 
            this._tabMinWidthChangedId = 0; 
        }
        if (this._tabMaxWidthChangedId > 0) { 
            gsettingsObj.disconnect(this._tabMaxWidthChangedId); 
            this._tabMaxWidthChangedId = 0; 
        }

        Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY); 
        Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY); 
        if (this._windowManager) { 
            this._windowManager.cleanupWindowProperties(); 
            this._windowManager.destroy(); 
            this._windowManager = null; 
        }
        if (this._highlightManager) { 
            this._highlightManager.destroy(); 
            this._highlightManager = null; 
        }
        if (this._indicator) { 
            this._indicator.destroy(); 
            this._indicator = null; 
        }
        if (this._settingsManager) { 
            this._settingsManager.destroy(); 
            this._settingsManager = null; 
        }

        log('Disabled.'); 
    }

    _addCycleKeybinding() {
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_ACCELERATOR_KEY)[0]; 
        log(`Binding cycle shortcut: ${accel}`); 

        Main.wm.addKeybinding( 
            CYCLE_ACCELERATOR_KEY, 
            this._settingsManager.getGSettingObject(), 
            Meta.KeyBindingFlags.NONE, 
            Shell.ActionMode.ALL, 
            () => {
                log('🏷️ Cycle shortcut pressed!'); 
                if (this._windowManager) this._windowManager.cycleWindowsInCurrentZone(); 
            }
        );
    }

    _addCycleBackwardKeybinding() {
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY)[0]; 
        log(`Binding backward cycle shortcut: ${accel}`); 

        Main.wm.addKeybinding( 
            CYCLE_BACKWARD_ACCELERATOR_KEY, 
            this._settingsManager.getGSettingObject(), 
            Meta.KeyBindingFlags.NONE, 
            Shell.ActionMode.ALL, 
            () => {
                log('🏷️ Backward cycle shortcut pressed!'); 
                if (this._windowManager) this._windowManager.cycleWindowsInCurrentZoneBackward(); 
            }
        );
    }
}
