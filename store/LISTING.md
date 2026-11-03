# Chrome Web Store listing

Copy these into the Developer Dashboard.

## Name
Aliases for Fastmail

## Summary (132 characters max)
Create Fastmail Masked Email aliases with a custom prefix and fill them into signup forms. Not affiliated with Fastmail.

## Category
Privacy & Security (in the "Make Chrome Yours" group). Runner-up: Communication.

## Description
Sign up for things without handing out your real email address.

Aliases for Fastmail creates Fastmail Masked Email addresses right inside signup forms. Click into an email field, click the @ bubble, and you get an address like netflix.k3j9x@fastmail.com, already filled in and copied to your clipboard. Mail to it lands in your Fastmail inbox, and you can turn it off any time.

Features
• Custom prefixes: the prefix defaults to the site's name (netflix, github, …) so you can tell your aliases apart at a glance. Edit it before creating.
• Fills the form for you, including "confirm email" fields, and works with React, Vue and web-component forms.
• Reuse: on a site where you already have an alias, it offers that one instead of making a new one.
• Right-click any field and choose "Create Fastmail alias here".
• Toolbar popup: create an alias for the current site, see all your aliases, copy them, turn them off and on, or delete them.
• Light and dark mode, following your browser.
• Plays well with password managers: your password manager saves the login with the alias when you submit.

Privacy
• Your Fastmail API token stays in your browser and is only ever sent to api.fastmail.com.
• No analytics, no tracking, no servers of our own.
• Open source under the Apache 2.0 license.

Setup
You need a Fastmail account. In Fastmail, go to Settings → Privacy & Security → Integrations → API tokens, create a token with the Masked Email scope only, and paste it into the extension's settings page.

This is an independent project. It is not made by, affiliated with or endorsed by Fastmail. Fastmail is a trademark of its owner.

## Single purpose
Create Fastmail Masked Email addresses and fill them into email fields on web pages.

## Permission justifications
- **storage:** Remembers the sites where the user chose "Don't show the @ button on this site" (only that list of site names), and, in memory only, which frame of a tab last showed the @ button so the popup fills the right field.
- **activeTab:** Reads the current tab's address when you open the popup, so a new alias is labeled with that site and filled into its email field.
- **contextMenus:** Adds "Create Fastmail alias here" to the right-click menu on editable fields.
- **Host permission api.fastmail.com:** The only server the extension talks to: it calls Fastmail's Masked Email API to list, create, turn on and off, and delete aliases.
- **Content script on all sites:** Signup forms can be on any website. The script detects email fields, shows the alias button on them and fills in the chosen address. It does not read or send page content.

## Remote code
No. All code, fonts and images are included in the package.

## Data usage (tick these in the Privacy practices tab)
- Personally identifiable information: yes (your masked email addresses, shown and filled at your request).
- Authentication information: yes (your Fastmail API token, stored locally and sent only to Fastmail).
- Everything else: no.

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL
Link to PRIVACY.md in your GitHub repo, for example:
https://github.com/YOUR-NAME/aliases-for-fastmail/blob/main/PRIVACY.md

## Images (in this folder)
- screenshot-1.png, screenshot-2.png (1280×800)
- promo-small.png (440×280)
- marquee.png (1400×560, optional "marquee promo tile")
- Store icon: icons/128.png
