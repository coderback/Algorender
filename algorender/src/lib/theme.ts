/** Where the reader's choice is kept; absent means "follow the OS". */
export const THEME_KEY = 'theme';

/**
 * Runs in <head> before first paint, so a chosen theme never flashes. An
 * embed's ?theme=light|dark wins for that page and is not saved.
 */
export const THEME_SCRIPT = `(function(){try{var t=new URLSearchParams(location.search).get('theme')||localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;
