// ./preferences/TabNamingSettingsGroup.js
import Adw from 'gi://Adw'; 
import Gtk from 'gi://Gtk'; 
import Gio from 'gi://Gio'; 
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

const APP_NAME_EXCEPTIONS_KEY = 'app-name-exceptions';
const WINDOW_TITLE_WORD_COUNT_KEY = 'window-title-word-count';
const log = msg => console.log(`[TabbedTilingPrefs.TabNaming] ${msg}`); 

export function createTabNamingSettingsGroup(settings) {
    const group = new Adw.PreferencesGroup({ 
        title: _('Tab Naming Behavior'),
        description: _('Configure how tab labels are displayed for different applications')
    }); 

    // Information section
    const infoRow = new Adw.ActionRow({
        title: _('How Tab Naming Works'),
        subtitle: _('Click to learn about tab naming behavior and configuration')
    });

    const infoButton = new Gtk.Button({
        icon_name: 'help-browser-symbolic',
        valign: Gtk.Align.CENTER,
        tooltip_text: _('Show tab naming help'),
        css_classes: ['flat', 'circular']
    });

    infoButton.connect('clicked', () => {
        _showTabNamingHelpDialog(infoRow.get_root());
    });

    infoRow.add_suffix(infoButton);
    group.add(infoRow);

    // Window Title Word Count
    const wordCountSpin = Gtk.SpinButton.new_with_range(0, 10, 1); 
    settings.bind(WINDOW_TITLE_WORD_COUNT_KEY, wordCountSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const wordCountRow = new Adw.ActionRow({ 
        title: _('Window Title Word Count'), 
        subtitle: _('Number of words to show from window title (0 = show full title)'), 
        activatable_widget: wordCountSpin 
    });
    wordCountRow.add_suffix(wordCountSpin); 
    group.add(wordCountRow); 

    // Add input row for new exceptions
    const addExceptionRow = new Adw.ActionRow({
        title: _('Add New Exception'),
        subtitle: _('Enter application ID (e.g., org.gnome.TextEditor)')
    });

    const exceptionEntry = new Gtk.Entry({
        placeholder_text: _('Application ID'),
        hexpand: true
    });

    const addButton = new Gtk.Button({
        label: _('Add'),
        valign: Gtk.Align.CENTER,
        css_classes: ['suggested-action']
    });

    addButton.connect('clicked', () => {
        const appId = exceptionEntry.get_text().trim();
        if (appId && _addAppIdToExceptions(settings, appId)) {
            exceptionEntry.set_text('');
            _refreshExceptionsList(settings, group, addExceptionRow);
        }
    });

    // Allow Enter key to add exception
    exceptionEntry.connect('activate', () => {
        addButton.emit('clicked');
    });

    addExceptionRow.add_suffix(exceptionEntry);
    addExceptionRow.add_suffix(addButton);
    group.add(addExceptionRow);

    // Load existing exceptions
    _refreshExceptionsList(settings, group, addExceptionRow);

    return group;
}

function _showTabNamingHelpDialog(parentWindow) {
    const helpText = `Tab Naming Behavior Explained:

DEFAULT BEHAVIOR:
• Most applications show their app name in tabs
• Example: "Firefox" for all Firefox windows
• Example: "Files" for all file manager windows

EXCEPTION BEHAVIOR:
• Applications in the exceptions list show window titles instead
• Useful for apps where the window title is more descriptive
• Example: Text editors showing document names
• Example: Terminals showing current directory

WORD COUNT SETTING:
• Controls how many words from window title to show
• 0 = Show full window title
• 1 = Show first word only (e.g., "document.txt" → "document.txt")
• 2 = Show first two words (e.g., "My Document - TextEditor" → "My Document")
• 3+ = Show specified number of words

EXAMPLES:

Normal App (Firefox):
• Tab shows: "Firefox" (always the same)

Exception App (Text Editor):
• Window title: "document.txt - Text Editor"
• Word count 1: Tab shows "document.txt"
• Word count 2: Tab shows "document.txt -"
• Word count 0: Tab shows "document.txt - Text Editor"

Exception App (Terminal):
• Window title: "user@hostname: /home/user/projects"
• Word count 1: Tab shows "user@hostname:"
• Word count 3: Tab shows "user@hostname: /home/user/projects"

APPLICATION IDs:
• Use the .desktop file name (e.g., "firefox.desktop")
• Or use the application ID (e.g., "org.gnome.TextEditor")
• Find app IDs using: "ps aux | grep [app-name]" or looking in /usr/share/applications/`;

    const dialog = new Adw.MessageDialog({
        heading: _("Tab Naming Configuration Guide"),
        body: helpText,
        transient_for: parentWindow,
        modal: true
    });
    dialog.add_response("ok", _("Got it"));
    dialog.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED);
    dialog.connect("response", (d) => d.destroy());
    dialog.present();
}

function _isAppIdInExceptions(settings, appId) {
    const exceptions = settings.get_strv(APP_NAME_EXCEPTIONS_KEY);
    return exceptions.includes(appId); // Keep original case for exact match
}

function _addAppIdToExceptions(settings, appId) {
    const exceptions = settings.get_strv(APP_NAME_EXCEPTIONS_KEY);
    if (!exceptions.includes(appId)) { // Prevent duplicates
        exceptions.push(appId);
        settings.set_strv(APP_NAME_EXCEPTIONS_KEY, exceptions);
        log(`Added app ID to exceptions: ${appId}`);
        return true;
    }
    return false;
}

function _removeAppIdFromExceptions(settings, appId) {
    const exceptions = settings.get_strv(APP_NAME_EXCEPTIONS_KEY);
    const filtered = exceptions.filter(id => id !== appId);
    settings.set_strv(APP_NAME_EXCEPTIONS_KEY, filtered);
    log(`Removed app ID from exceptions: ${appId}`);
}

function _refreshExceptionsList(settings, group, addExceptionRow) {
    // Use a small delay to ensure GSettings changes are propagated
    setTimeout(() => {
        _doRefreshExceptionsList(settings, group, addExceptionRow);
    }, 100);
}

function _doRefreshExceptionsList(settings, group, addExceptionRow) {
    // Remove all exception rows except the fixed rows (info, word count, add row)
    let child = group.get_first_child();
    while (child) {
        const next = child.get_next_sibling();
        if (child instanceof Adw.ActionRow) {
            const title = child.title || '';
            if (title.includes('How Tab Naming Works') || title.includes('Window Title Word Count') || title.includes('Add New Exception')) {
                // Keep these fixed rows
            } else {
                // This is an exception row, remove it
                group.remove(child);
            }
        }
        child = next;
    }

    // Get fresh data from GSettings
    const exceptions = settings.get_strv(APP_NAME_EXCEPTIONS_KEY);
    log(`Refreshing with ${exceptions.length} exceptions: ${exceptions.join(', ')}`);
    
    exceptions.forEach(appId => {
        const exceptionRow = new Adw.ActionRow({
            title: appId,
            subtitle: _('Shows window title instead of app name')
        });

        // Create a more visible delete button
        const removeButton = new Gtk.Button({
            label: _('Remove'),
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove this exception'),
            css_classes: ['destructive-action']
        });

        removeButton.connect('clicked', () => {
            log(`User clicked remove for: ${appId}`);
            _removeAppIdFromExceptions(settings, appId);
            _refreshExceptionsList(settings, group, addExceptionRow);
        });

        exceptionRow.add_suffix(removeButton);
        exceptionRow.set_activatable_widget(null);
        
        // Add the row to the group
        group.add(exceptionRow);
        
        log(`Added exception row for: ${appId}`);
    });
}

function _getChildPosition(parent, child) {
    let position = 0;
    let currentChild = parent.get_first_child();
    while (currentChild) {
        if (currentChild === child) {
            return position;
        }
        currentChild = currentChild.get_next_sibling();
        position++;
    }
    return -1;
}
