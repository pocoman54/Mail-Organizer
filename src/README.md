# Mail Organizer 0.1.87.17

Compatibility and reporting release.

- Adds Search + Save to File to Filter Activity.
- Activity Log Save to File respects the current search/result filter.
- Adds Save to File to diagnostic and simulation information.
- Implements previously pending criteria where Thunderbird exposes data: Body, Date, Priority, Junk Status, Junk Percent, Attachment Status, and custom headers.
- Implements Junk Status, Archive, and Delete actions.
- Stop Filter Execution is now logged/executed after Copy; after Move an immediately following Stop is also logged/executed before processing terminates.
- Set Priority remains visible for Thunderbird compatibility but cannot be executed because Thunderbird's MailExtension messages.update API does not allow changing priority on an existing message.
- Thunderbird import recognizes more criteria/actions and imports Stop Execution as a real action.


0.1.87.17: Added Export Sender Addresses. Select a Thunderbird folder, scan all messages, deduplicate From addresses, compare them with ExcludedBook, search the results, and save the currently displayed addresses as TXT or CSV.


## 0.1.87.17
- Incoming Live now automatically captures senders in Unmatched Senders when the full enabled organizational filter chain finishes with no match.
- NEWMAIL / diagnostic counters, All Messages, and final catch-all rules do not suppress Unmatched capture.
- New unmatched captures are written to Activity Log as `Capture Unmatched`.
- Existing ExcludedBook behavior is unchanged: Excluded matches run their configured actions (for example Move + Stop).


0.1.87.17 performance fix: ExcludedBook is preloaded once per incoming/manual batch into a normalized in-memory Set; progress now identifies cache loading vs matching/actions.


0.1.87.17: Preferences adds selectable color schemes with live preview. Advanced now opens a safe inspection panel showing legacy/advanced functions and their supported main-screen replacements.
