# Mail-Organizer-
 Thunderbird A visual, transparent alternative to Thunderbird's built-in mail filters.
 # Mail Organizer for Thunderbird

**Mail Organizer** is a visual mail-filter management extension for Mozilla Thunderbird.

It is designed to make creating, testing, organizing, running, and troubleshooting email filters easier and more transparent than working with a large collection of traditional Thunderbird filters.

**Current Release: v0.1.87.17**

## Features

### Visual Filter Management

- Create and edit mail-filter rules
- Enable or disable individual filters
- Organize filters in execution order
- Highlight one or multiple filters
- Run selected filters
- Go directly to the top or bottom of a long filter list
- Move selected filters to the top or bottom while preserving their relative order
- Protected Excluded Senders rule

### Simulation

Test filters before allowing them to modify messages.

Simulation can show:

- Which messages match
- Which filters matched
- Multiple matches
- Unmatched messages
- Potential filter conflicts

This is especially useful before running filters against a large mailbox.

### Manual Run

Run selected filters against an existing Thunderbird folder.

Mail Organizer displays progress while processing messages and reports:

- Messages scanned
- Messages matched
- Messages not matched
- Errors
- Matches by filter

### Incoming Live

Mail Organizer can process newly arriving messages automatically.

Enabled filters are evaluated in their displayed execution order.

Messages that reach the end of the organizational filter chain without matching a real organizational rule can automatically be recorded in **Unmatched Senders**.

### ExcludedBook

Mail Organizer supports a Thunderbird Address Book named **ExcludedBook** for senders that should be handled by the protected **Excluded Senders** rule.

The Excluded Senders rule can, for example:

1. Detect that the sender belongs to ExcludedBook
2. Move the message to a designated folder
3. Stop further filter processing

ExcludedBook addresses are cached during processing for faster matching.

### Unmatched Senders

When Incoming Live encounters a sender that does not match an organizational filter, Mail Organizer can add the sender to the **Unmatched Senders** list.

From there you can review the sender and decide whether to:

- Add the sender to an existing filter
- Add the sender to ExcludedBook
- Remove the sender from the unmatched list

Mail Organizer does **not** automatically add unmatched senders to ExcludedBook.

### Address Books and Mailing Lists

Filter conditions can use Thunderbird Address Books and Mailing Lists.

This makes it possible to create rules such as:

- From is in Address Book
- From is not in Address Book
- Sender is in Mailing List

Address-book information is cached during processing to improve performance.

### Filter Activity

Mail Organizer tracks filter usage so you can see whether your rules are actually being used.

Activity information can include:

- Filter name
- Enabled state
- Match totals
- Recent activity
- Last matched date/time
- Last folder

### Activity Log

Mail Organizer provides an operational log showing what happened to messages.

Entries can identify:

- Processing mode
- Filter
- Sender
- Subject
- Action
- Destination
- SUCCESS / FAILED result

This makes it much easier to determine why a message moved, copied, stopped processing, or otherwise changed.

### Diagnostics

Diagnostic tools help identify potential problems such as:

- Duplicate filters
- Conflicting rules
- Overlapping conditions
- Unexpected matching behavior

### Search and Export

Activity and reporting tools include search and export capabilities where available.

Reports can be saved for later analysis.

### Color Schemes

Mail Organizer v0.1.87.17 includes selectable interface color schemes.

Available schemes include:

- Blue / Teal
- Classic Blue
- Dark
- Light / Neutral
- Slate
- Green
- Purple
- High Contrast

The selected scheme is saved in Preferences.

## Installation

Download the latest `.xpi` file from the repository's **Releases** section.

In Thunderbird:

1. Open **Add-ons and Themes**
2. Click the gear/menu button
3. Select **Install Add-on From File…**
4. Select
