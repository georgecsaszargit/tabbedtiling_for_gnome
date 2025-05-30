// ./preferences/TabBarSettingsGroup.js
import Adw from 'gi://Adw'; 
import Gtk from 'gi://Gtk'; 
import Gio from 'gi://Gio'; 
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

const TAB_BAR_HEIGHT_KEY                    = 'tab-bar-height'; 
const TAB_FONT_SIZE_KEY                     = 'tab-font-size'; 
const TAB_ICON_SIZE_KEY                     = 'tab-icon-size'; 
const TAB_CORNER_RADIUS_KEY                 = 'tab-corner-radius'; 
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY        = 'tab-close-button-icon-size'; 
const TAB_SPACING_KEY                       = 'tab-spacing'; 
const TAB_MIN_WIDTH_KEY                     = 'tab-min-width'; 
const TAB_MAX_WIDTH_KEY                     = 'tab-max-width'; 

export function createTabBarSettingsGroup(settings) {
    const group = new Adw.PreferencesGroup({ 
        title: _('Tab Bar Adjustments'),
        description: _('Customize the appearance and behavior of tab bars')
    }); 

    // Tab Bar Height
    const heightSpin = Gtk.SpinButton.new_with_range(16, 200, 1); 
    settings.bind(TAB_BAR_HEIGHT_KEY, heightSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const heightRow = new Adw.ActionRow({ 
        title: _('Tab Bar Height (px)'), 
        subtitle: _('Height in pixels for the tab bar'), 
        activatable_widget: heightSpin 
    });
    heightRow.add_suffix(heightSpin); 
    group.add(heightRow); 

    // Tab Font Size
    const fontSpin = Gtk.SpinButton.new_with_range(6, 72, 1); 
    settings.bind(TAB_FONT_SIZE_KEY, fontSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const fontRow = new Adw.ActionRow({ 
        title: _('Tab Font Size (px)'), 
        subtitle: _('Font size in pixels for the tab labels'), 
        activatable_widget: fontSpin 
    });
    fontRow.add_suffix(fontSpin); 
    group.add(fontRow); 

    // Tab Icon Size
    const tabIconSizeSpin = Gtk.SpinButton.new_with_range(8, 64, 1); 
    settings.bind(TAB_ICON_SIZE_KEY, tabIconSizeSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const tabIconSizeRow = new Adw.ActionRow({ 
        title: _('Tab Icon Size (px)'), 
        subtitle: _('Size for application icons in tabs'), 
        activatable_widget: tabIconSizeSpin 
    });
    tabIconSizeRow.add_suffix(tabIconSizeSpin); 
    group.add(tabIconSizeRow); 

    // Tab Corner Radius
    const tabCornerRadiusSpin = Gtk.SpinButton.new_with_range(0, 20, 1); 
    settings.bind(TAB_CORNER_RADIUS_KEY, tabCornerRadiusSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const tabCornerRadiusRow = new Adw.ActionRow({ 
        title: _('Tab Corner Radius (px)'), 
        subtitle: _('Radius for the top corners of tabs'), 
        activatable_widget: tabCornerRadiusSpin 
    });
    tabCornerRadiusRow.add_suffix(tabCornerRadiusSpin); 
    group.add(tabCornerRadiusRow); 

    // Tab Close Button Icon Size
    const tabCloseButtonIconSizeSpin = Gtk.SpinButton.new_with_range(8, 32, 1); 
    settings.bind(TAB_CLOSE_BUTTON_ICON_SIZE_KEY, tabCloseButtonIconSizeSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const tabCloseButtonIconSizeRow = new Adw.ActionRow({ 
        title: _('Tab Close Button Icon Size (px)'), 
        subtitle: _('Size for the close icon in tabs'), 
        activatable_widget: tabCloseButtonIconSizeSpin 
    });
    tabCloseButtonIconSizeRow.add_suffix(tabCloseButtonIconSizeSpin); 
    group.add(tabCloseButtonIconSizeRow); 

    // Tab Spacing
    const tabSpacingSpin = Gtk.SpinButton.new_with_range(0, 50, 1); 
    settings.bind(TAB_SPACING_KEY, tabSpacingSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const tabSpacingRow = new Adw.ActionRow({ 
        title: _('Tab Spacing (px)'), 
        subtitle: _('Gap between individual tabs'), 
        activatable_widget: tabSpacingSpin 
    });
    tabSpacingRow.add_suffix(tabSpacingSpin); 
    group.add(tabSpacingRow); 

    // Tab Min Width
    const tabMinWidthSpin = Gtk.SpinButton.new_with_range(30, 300, 5); 
    settings.bind(TAB_MIN_WIDTH_KEY, tabMinWidthSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const tabMinWidthRow = new Adw.ActionRow({ 
        title: _('Tab Minimum Width (px)'), 
        subtitle: _('Smallest width a tab can shrink to'), 
        activatable_widget: tabMinWidthSpin 
    });
    tabMinWidthRow.add_suffix(tabMinWidthSpin); 
    group.add(tabMinWidthRow); 

    // Tab Max Width
    const tabMaxWidthSpin = Gtk.SpinButton.new_with_range(50, 500, 5); 
    settings.bind(TAB_MAX_WIDTH_KEY, tabMaxWidthSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const tabMaxWidthRow = new Adw.ActionRow({ 
        title: _('Tab Maximum Width (px)'), 
        subtitle: _('Largest width a tab can expand to'), 
        activatable_widget: tabMaxWidthSpin 
    });
    tabMaxWidthRow.add_suffix(tabMaxWidthSpin); 
    group.add(tabMaxWidthRow); 

    return group;
}
