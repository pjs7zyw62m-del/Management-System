# BLACKCELL production employee invitation

The invitation Edge Function requests the production employee portal. The hosted Auth Site URL and redirect allowlist must remain production-only.

For defense in depth, after the new activation page is deployed, change ONLY the invitation button's href in Authentication → Email Templates → Invite user to:

```html
href="https://blackcellcorp.com/blackcell-invitation-activate.html#type=invite&amp;token_hash={{ .TokenHash }}"
```

Preserve the existing subject, styling, employee name and security-code wording. No other email template or SMTP provider settings are changed. Do not substitute the recovery template: it has a different token type and may serve other account flows.

The link goes directly to BLACKCELL, not to the provider's redirect endpoint. The fragment is not sent in HTTP requests; the page clears it before any token exchange, requires an intentional button press, and uses verifyOtp with type invite. The existing employee portal still independently checks membership, password activation and security codes. No account or access is granted just by loading the page.

Verify the deployed page loads without a token, then save the invitation template. Send a new invitation to an authorized test inbox. Check the first-party host, click Verify Invitation, establish the password, and complete the normal security-code process. A reused link should fail. Never forward the actual token or use a real employee account for automated tests. Already-consumed invitations require Resume Activation through the existing employee portal.

The GitHub deployment does not change hosted authentication templates; an authorized administrator must save that one-time change in the dashboard.
