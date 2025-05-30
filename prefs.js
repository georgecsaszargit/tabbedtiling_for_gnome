// prefs.js
import Adw from 'gi://Adw'; 
import Gdk from 'gi://Gdk'; 
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

// Import new preference group modules
import { createGeneralSettingsGroup } from './preferences/GeneralSettingsGroup.js';
import { createTabBarSettingsGroup } from './preferences/TabBarSettingsGroup.js';
import { createTabNamingSettingsGroup } from './preferences/TabNamingSettingsGroup.js';
import { ZoneDefinitionsGroup } from './preferences/ZoneDefinitionsGroup.js';

const log = msg => console.log(`[TabbedTilingPrefs] ${msg}`); 

export default class TabbedTilingPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings(); 
        this._window = window; 
        this._evasionKeySignalId = 0;

        const display = Gdk.Display.get_default(); 
        const monitorCount = display?.get_monitors().get_n_items() || 1; 

        // General Settings Page
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic'
        }); 
        window.add(generalPage); 

        const { group: generalGroup, evasionKeySettingChangedId } = createGeneralSettingsGroup(this._settings); 
        generalPage.add(generalGroup);
        this._evasionKeySignalId = evasionKeySettingChangedId;

        // Zone Definitions Page
        const zonesPage = new Adw.PreferencesPage({
            title: _('Zones'),
            icon_name: 'applications-graphics-symbolic'
        }); 
        window.add(zonesPage);

        this._zoneDefinitionsManager = new ZoneDefinitionsGroup(this._settings, monitorCount, window);
        const zoneDefinitionsGroup = this._zoneDefinitionsManager.getWidget();
        zonesPage.add(zoneDefinitionsGroup);

        // Tab Bar Appearance Page
        const tabBarPage = new Adw.PreferencesPage({
            title: _('Tab Appearance'),
            icon_name: 'view-grid-symbolic'
        }); 
        window.add(tabBarPage);

        const tabBarGroup = createTabBarSettingsGroup(this._settings); 
        tabBarPage.add(tabBarGroup);

        // Tab Naming Page
        const tabNamingPage = new Adw.PreferencesPage({
            title: _('Tab Naming'),
            icon_name: 'format-text-symbolic'
        }); 
        window.add(tabNamingPage);

        const tabNamingGroup = createTabNamingSettingsGroup(this._settings);
        tabNamingPage.add(tabNamingGroup);

        // Disconnect the signal when the preferences window is destroyed
        if (window && typeof window.connect === 'function') { 
            window.connect('close-request', () => { 
                if (this._settings && this._evasionKeySignalId > 0) { 
                    try {
                        this._settings.disconnect(this._evasionKeySignalId); 
                        this._evasionKeySignalId = 0;
                    } catch (e) {
                        log(`Error disconnecting evasionKeySettingChangedId: ${e}`); 
                    }
                }
                return false;
            });
        }
    }
}
