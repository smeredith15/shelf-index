import { useEffect, useState } from 'preact/hooks';

export interface Route {
  path: string[];
  params: URLSearchParams;
}

function parse(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query] = hash.split('?');
  return { path: path.split('/').filter(Boolean), params: new URLSearchParams(query ?? '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    // The address may have changed between the first render and this listener starting.
    setRoute(parse());
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string, replace = false): void {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (replace) location.replace(hash);
  else location.hash = hash;
}
