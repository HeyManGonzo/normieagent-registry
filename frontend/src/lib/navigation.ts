export function navigate(href: string, e?: React.MouseEvent) {
  if (e) e.preventDefault();
  if (window.location.pathname !== href) {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}
