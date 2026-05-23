import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ShieldCheck, LogOut, Sun, Moon } from 'lucide-react';
import { auth, database } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/utils';
import { Logo } from './Logo';

export function Layout() {
  const [time, setTime] = useState(new Date());
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [libraryStatus, setLibraryStatus] = useState<any>(null);

  useEffect(() => {
    const statusRef = ref(database, 'library_status');
    const unsubscribe = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLibraryStatus(data);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-LK', { 
    timeZone: 'Asia/Colombo', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true 
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center space-x-3">
          <Link to="/" className="group">
            <Logo />
          </Link>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button 
            onClick={toggleTheme}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sun className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {(() => {
            // 1. Safely grab the heartbeat from your Firebase state
            const heartbeat = libraryStatus?.last_heartbeat;
            
            // 2. Check if it exists AND if it is less than 65 seconds old
            const isOnline = heartbeat 
              ? (Date.now() - heartbeat < 65000) 
              : false;

            // 3. Render the correct color and text with existing styled badge matching our theme
            return (
              <div className={cn(
                "flex items-center px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-full border transition-all duration-300",
                isOnline 
                  ? "bg-brand-green/10 border-brand-green/30 text-brand-green dark:bg-brand-green/20 dark:border-brand-green/30" 
                  : "bg-red-500/10 border-red-500/30 text-red-500 dark:bg-red-950/25 dark:border-red-900/30"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mr-1 sm:mr-2 shrink-0",
                  isOnline 
                    ? "bg-brand-green animate-pulse shadow-[0_0_8px_var(--color-brand-green)]" 
                    : "bg-red-500"
                )}></span>
                <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-wider">
                  {isOnline ? "Online" : "Offline"}
                </span>
              </div>
            );
          })()}

          {user && (
            <button 
              onClick={() => auth.signOut()}
              className="p-1.5 sm:p-2 rounded-xl bg-red-550/10 dark:bg-red-950/25 border border-red-100 dark:border-red-900/35 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all shadow-sm flex items-center justify-center font-bold text-[9px] sm:text-[10px] uppercase tracking-wider px-2 py-1 sm:px-3 sm:py-1.5 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}

          <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-2 sm:pl-4">
            <p className="hidden xs:block text-[8px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-tighter">Central Library</p>
            <p className="text-[10px] sm:text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{timeStr}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wide uppercase">© 2026 SeatIdle IoT Systems • v1.0.4-stable</p>
        <div className="flex items-center space-x-6">
          {user ? (
            <div className="flex items-center space-x-4">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
                ID: {user.email?.split('@')[0]}
              </span>
              <button 
                onClick={() => auth.signOut()}
                className="text-[10px] font-bold text-red-500/70 hover:text-red-500 dark:text-red-400/70 dark:hover:text-red-400 uppercase tracking-widest flex items-center transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10"
              >
                <LogOut className="w-3 h-3 mr-1.5" />
                Logout
              </button>
            </div>
          ) : (
            location.pathname !== '/admin' && (
              <Link to="/admin" className="text-[10px] font-bold text-brand-blue dark:text-brand-green uppercase tracking-widest flex items-center hover:opacity-80 transition-opacity">
                Admin Access
                <ShieldCheck className="w-3 h-3 ml-1" />
              </Link>
            )
          )}
        </div>
      </footer>
    </div>
  );
}
