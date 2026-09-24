import '../styles/globals.css';

export const metadata = {
  title: 'SmartBreath',
  description: 'School and child safe-air early warning dashboard'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
