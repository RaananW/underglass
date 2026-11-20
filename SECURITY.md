# Security policy

Underglass is experimental. Please report a vulnerability
privately through GitHub's **Report a vulnerability** button on the repository's
Security tab, not in a public issue. Include the browser build, the affected
component or example, and steps to reproduce.

Areas of particular interest: content from one origin reaching another through GPU
capture, custom WGSL effects (`defineEffect` is for trusted application code only),
and the webcam example (camera frames must never leave the page).
