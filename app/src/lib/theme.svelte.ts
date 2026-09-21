/**
 * Light by default, dark on request, remembered. The studio does the same and
 * ignores the system preference on purpose: a marketing site and its tools
 * should look identical in a screenshot and on the visitor's screen.
 */

const STORAGE_KEY = "piighost-hub-theme";

class Theme {
  dark = $state(localStorage.getItem(STORAGE_KEY) === "dark");

  constructor() {
    this.apply();
  }

  toggle() {
    this.dark = !this.dark;
    localStorage.setItem(STORAGE_KEY, this.dark ? "dark" : "light");
    this.apply();
  }

  private apply() {
    document.documentElement.classList.toggle("dark", this.dark);
  }
}

export const theme = new Theme();
