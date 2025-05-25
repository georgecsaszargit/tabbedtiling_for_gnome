// ./preferences/TabBarSettingsGroup.js
import Adw from 'gi://Adw'; // [cite: 511]
import Gtk from 'gi://Gtk'; // [cite: 512]
import Gio from 'gi://Gio'; // [cite: 512]
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; // [cite: 513]

const TAB_BAR_HEIGHT_KEY                    = 'tab-bar-height'; // [cite: 521]
const TAB_FONT_SIZE_KEY                     = 'tab-font-size'; // [cite: 522]
const TAB_ICON_SIZE_KEY                     = 'tab-icon-size'; // [cite: 524]
const TAB_CORNER_RADIUS_KEY                 = 'tab-corner-radius'; // [cite: 525]
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY        = 'tab-close-button-icon-size'; // [cite: 526]
const TAB_SPACING_KEY                       = 'tab-spacing'; // [cite: 527]
const TAB_MIN_WIDTH_KEY                     = 'tab-min-width'; // [cite: 528]
const TAB_MAX_WIDTH_KEY                     = 'tab-max-width'; // [cite: 529]

export function createTabBarSettingsGroup(settings) {
    const group = new Adw.PreferencesGroup({ title: _('Tab Bar Adjustments') }); // [cite: 584]

    // Tab Bar Height
    const heightSpin = Gtk.SpinButton.new_with_range(16, 200, 1); // [cite: 585]
    settings.bind(TAB_BAR_HEIGHT_KEY, heightSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 586]
    const heightRow = new Adw.ActionRow({ // [cite: 586]
        title: _('Tab Bar Height (px)'), // [cite: 586]
        subtitle: _('Height in pixels for the tab bar'), // [cite: 586]
        activatable_widget: heightSpin // [cite: 586]
    });
    heightRow.add_suffix(heightSpin); // [cite: 587]
    group.add(heightRow); // [cite: 587]

    // Tab Font Size
    const fontSpin = Gtk.SpinButton.new_with_range(6, 72, 1); // [cite: 587]
    settings.bind(TAB_FONT_SIZE_KEY, fontSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 588]
    const fontRow = new Adw.ActionRow({ // [cite: 588]
        title: _('Tab Font Size (px)'), // [cite: 588]
        subtitle: _('Font size in pixels for the tab labels'), // [cite: 588]
        activatable_widget: fontSpin // [cite: 588]
    });
    fontRow.add_suffix(fontSpin); // [cite: 589]
    group.add(fontRow); // [cite: 589]

    // Tab Icon Size
    const tabIconSizeSpin = Gtk.SpinButton.new_with_range(8, 64, 1); // [cite: 596]
    settings.bind(TAB_ICON_SIZE_KEY, tabIconSizeSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 597]
    const tabIconSizeRow = new Adw.ActionRow({ // [cite: 597]
        title: _('Tab Icon Size (px)'), // [cite: 597]
        subtitle: _('Size for application icons in tabs'), // [cite: 597]
        activatable_widget: tabIconSizeSpin // [cite: 597]
    });
    tabIconSizeRow.add_suffix(tabIconSizeSpin); // [cite: 598]
    group.add(tabIconSizeRow); // [cite: 598]

    // Tab Corner Radius
    const tabCornerRadiusSpin = Gtk.SpinButton.new_with_range(0, 20, 1); // [cite: 598]
    settings.bind(TAB_CORNER_RADIUS_KEY, tabCornerRadiusSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 599]
    const tabCornerRadiusRow = new Adw.ActionRow({ // [cite: 599]
        title: _('Tab Corner Radius (px)'), // [cite: 599]
        subtitle: _('Radius for the top corners of tabs'), // [cite: 599]
        activatable_widget: tabCornerRadiusSpin // [cite: 599]
    });
    tabCornerRadiusRow.add_suffix(tabCornerRadiusSpin); // [cite: 600]
    group.add(tabCornerRadiusRow); // [cite: 600]

    // Tab Close Button Icon Size
    const tabCloseButtonIconSizeSpin = Gtk.SpinButton.new_with_range(8, 32, 1); // [cite: 600]
    settings.bind(TAB_CLOSE_BUTTON_ICON_SIZE_KEY, tabCloseButtonIconSizeSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 601]
    const tabCloseButtonIconSizeRow = new Adw.ActionRow({ // [cite: 601]
        title: _('Tab Close Button Icon Size (px)'), // [cite: 601]
        subtitle: _('Size for the close icon in tabs'), // [cite: 601]
        activatable_widget: tabCloseButtonIconSizeSpin // [cite: 601]
    });
    tabCloseButtonIconSizeRow.add_suffix(tabCloseButtonIconSizeSpin); // [cite: 602]
    group.add(tabCloseButtonIconSizeRow); // [cite: 602]

    // Tab Spacing
    const tabSpacingSpin = Gtk.SpinButton.new_with_range(0, 50, 1); // [cite: 602]
    settings.bind(TAB_SPACING_KEY, tabSpacingSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 603]
    const tabSpacingRow = new Adw.ActionRow({ // [cite: 603]
        title: _('Tab Spacing (px)'), // [cite: 603]
        subtitle: _('Gap between individual tabs'), // [cite: 603]
        activatable_widget: tabSpacingSpin // [cite: 603]
    });
    tabSpacingRow.add_suffix(tabSpacingSpin); // [cite: 604]
    group.add(tabSpacingRow); // [cite: 604]

    // Tab Min Width
    const tabMinWidthSpin = Gtk.SpinButton.new_with_range(30, 300, 5); // [cite: 604]
    settings.bind(TAB_MIN_WIDTH_KEY, tabMinWidthSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 605]
    const tabMinWidthRow = new Adw.ActionRow({ // [cite: 605]
        title: _('Tab Minimum Width (px)'), // [cite: 605]
        subtitle: _('Smallest width a tab can shrink to'), // [cite: 605]
        activatable_widget: tabMinWidthSpin // [cite: 605]
    });
    tabMinWidthRow.add_suffix(tabMinWidthSpin); // [cite: 606]
    group.add(tabMinWidthRow); // [cite: 606]

    // Tab Max Width
    const tabMaxWidthSpin = Gtk.SpinButton.new_with_range(50, 500, 5); // [cite: 606]
    settings.bind(TAB_MAX_WIDTH_KEY, tabMaxWidthSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 607]
    const tabMaxWidthRow = new Adw.ActionRow({ // [cite: 607]
        title: _('Tab Maximum Width (px)'), // [cite: 607]
        subtitle: _('Largest width a tab can expand to'), // [cite: 607]
        activatable_widget: tabMaxWidthSpin // [cite: 607]
    });
    tabMaxWidthRow.add_suffix(tabMaxWidthSpin); // [cite: 608]
    group.add(tabMaxWidthRow); // [cite: 608]

    return group;
}
