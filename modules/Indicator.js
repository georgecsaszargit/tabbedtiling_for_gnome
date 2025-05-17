import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js'; // MOVED TO TOP LEVEL
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const ENABLE_ZONING_KEY = 'enable-auto-zoning';
const log = (msg) => console.log(`[AutoZoner.Indicator] ${msg}`);

export class Indicator {
    constructor(uuid, settingsManager, extensionObject) {
        this._uuid = uuid;
        this._settingsManager = settingsManager;
        this._extensionObject = extensionObject;
        this._indicator = null;
        this._toggleItemSignalId = 0;
        this._prefsItemSignalId = 0;

        this._init();
        log("Initialized.");
    }

    _init() {
        this._indicator = new PanelMenu.Button(0.5, _('Auto Zoner'), false);
        const icon = new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);
        this._buildMenu();
        Main.panel.addToStatusArea(this._uuid, this._indicator); // Main is imported at top
    }

    _buildMenu() {
        if (!this._indicator) return;
        this._indicator.menu.removeAll();

        const zoningEnabled = this._settingsManager.isZoningEnabled();
        const toggleItem = new PopupMenu.PopupSwitchMenuItem(
            _("Enable Auto Zoning"),
            zoningEnabled
        );

        // Ensure we don't double-connect if _buildMenu is called multiple times
        if(this._toggleItemSignalId > 0) {
            try { if (toggleItem.is_connected(this._toggleItemSignalId)) toggleItem.disconnect(this._toggleItemSignalId); }
            catch(e) { /* ignore */ }
        }
        this._toggleItemSignalId = toggleItem.connect('toggled', (item) => {
            this._settingsManager.getGSettingObject().set_boolean(ENABLE_ZONING_KEY, item.state);
        });
        this._indicator.menu.addMenuItem(toggleItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem(_('Settings'));
         if(this._prefsItemSignalId > 0) {
            try { if (prefsItem.is_connected(this._prefsItemSignalId)) prefsItem.disconnect(this._prefsItemSignalId); }
            catch(e) { /* ignore */ }
        }
        this._prefsItemSignalId = prefsItem.connect('activate', () => {
            this._extensionObject.openPreferences();
        });
        this._indicator.menu.addMenuItem(prefsItem);
    }

    updateToggleState() {
        if (!this._indicator || !this._indicator.menu) return;
        const menuItems = this._indicator.menu._getMenuItems();
        if (menuItems && menuItems.length > 0 && menuItems[0] instanceof PopupMenu.PopupSwitchMenuItem) {
            // Temporarily disconnect to prevent feedback loop if setToggleState itself emits 'toggled'
            const toggleItem = menuItems[0];
            const wasConnected = this._toggleItemSignalId > 0 && toggleItem.is_connected(this._toggleItemSignalId);
            if (wasConnected) toggleItem.disconnect(this._toggleItemSignalId);
            
            toggleItem.setToggleState(this._settingsManager.isZoningEnabled());
            
            if (wasConnected) { // Reconnect if it was previously connected
                 this._toggleItemSignalId = toggleItem.connect('toggled', (item) => {
                    this._settingsManager.getGSettingObject().set_boolean(ENABLE_ZONING_KEY, item.state);
                });
            }
        }
    }

    destroy() {
        // Attempt to disconnect signals from menu items before destroying the indicator
        if (this._indicator && this._indicator.menu) {
            const menuItems = this._indicator.menu._getMenuItems();
            if (this._toggleItemSignalId > 0 && menuItems && menuItems.length > 0 && menuItems[0] instanceof PopupMenu.PopupSwitchMenuItem) {
                const toggleItem = menuItems[0];
                try { if(toggleItem.is_connected(this._toggleItemSignalId)) toggleItem.disconnect(this._toggleItemSignalId); } catch(e) {/*ignore*/}
            }
             if (this._prefsItemSignalId > 0 && menuItems && menuItems.length > 2 && menuItems[2] instanceof PopupMenu.PopupMenuItem) { // Index 2 if separator is present
                const prefsItem = menuItems[2];
                 try { if(prefsItem.is_connected(this._prefsItemSignalId)) prefsItem.disconnect(this._prefsItemSignalId); } catch(e) {/*ignore*/}
            }
        }
        this._toggleItemSignalId = 0;
        this._prefsItemSignalId = 0;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        log("Destroyed.");
    }
}
