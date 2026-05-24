import { useState, useEffect, FormEvent } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { ref, onValue, set, push, remove, update, get } from 'firebase/database';
import { auth, database } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Mail, 
  UserPlus, 
  LogIn, 
  Search, 
  Radio, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Activity, 
  Map as MapIcon, 
  Phone, 
  ArrowUpRight, 
  ArrowRight, 
  BookOpen, 
  QrCode, 
  ClipboardList, 
  HelpCircle, 
  Copy, 
  Check, 
  Megaphone, 
  Bell,
  X,
  SlidersHorizontal,
  Ticket,
  ChevronRight,
  VolumeX,
  Cpu,
  TrendingUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Loader } from '../components/ui/Loader';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LibraryStatus {
  capacity: number;
  occupancy: number;
  system_online: boolean;
  last_heartbeat?: number;
}

interface Staff {
  id: string;
  name: string;
  is_present: boolean;
  role?: string;
  department?: string;
  email?: string;
  phone?: string;
  joined_date?: string;
  last_updated?: string;
  logs?: Record<string, {
    timestamp: string;
    status: 'IN' | 'OUT';
    method?: string;
  }>;
}

interface Announcement {
  id: string;
  text: string;
  createdAt: string;
}

interface Reservation {
  id: string;
  name: string;
  time: string;
  date: string;
  is_used: boolean;
  otp: string;
  userId: string;
  createdAt: string;
  start_time?: number;
  end_time?: number;
}

export function Dashboard() {
  const { user } = useAuth();
  
  // Firebase State
  const [status, setStatus] = useState<LibraryStatus>({
    capacity: 50,
    occupancy: 0,
    system_online: true
  });
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [activeReservationsList, setActiveReservationsList] = useState<Reservation[]>([]);
  const [scheduledReservationsList, setScheduledReservationsList] = useState<Reservation[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Selected seat modal states for tactile mobile control
  const [selectedDesk, setSelectedDesk] = useState<{
    index: number;
    letter: string;
    num: number;
    zone: string;
    description: string;
    isOccupied: boolean;
    guidelines: string[];
  } | null>(null);

  // Filter zone choice state (all, A, B, C, D)
  const [activeZoneFilter, setActiveZoneFilter] = useState<'all' | 'A' | 'B' | 'C' | 'D'>('all');

  // Merge active and scheduled reservations safely (with uniqueness by ID)
  const reservations = (() => {
    const all = [...activeReservationsList, ...scheduledReservationsList];
    const map = new Map();
    all.forEach(item => {
      map.set(item.id, item);
    });
    return Array.from(map.values()) as Reservation[];
  })();
  
  // Booking Form State
  const [bookingName, setBookingName] = useState('');
  const [bookingSlot, setBookingSlot] = useState('08:00 - 10:00');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  // Student Auth State
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  
  // SeatIdle IoT Access Terminal emulator state
  const [terminalOtp, setTerminalOtp] = useState('');
  const [terminalStatus, setTerminalStatus] = useState<'idle' | 'success' | 'error' | 'scanning'>('idle');
  const [terminalMessage, setTerminalMessage] = useState('');
  const [gateUnlocked, setGateUnlocked] = useState(false);
  
  const ALLOWED_ADMINS = ['admin@seatidle.com'];
  const isAdmin = user && ALLOWED_ADMINS.includes(user.email || '');

  useEffect(() => {
    setAuthError(null);
    setResetSent(false);
  }, [authMode, showAuth]);

  // Tab & search configuration
  const [dashboardTab, setDashboardTab] = useState<'live' | 'reserve' | 'staff' | 'notices'>('live');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedOtp, setCopiedOtp] = useState<string | null>(null);

  const handleCopyOtp = (otp: string) => {
    navigator.clipboard.writeText(otp);
    setCopiedOtp(otp);
    setTimeout(() => setCopiedOtp(null), 1500);
  };

  const handleTerminalVerify = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!terminalOtp.trim()) return;

    setTerminalStatus('scanning');
    setTerminalMessage('Scanning device queues...');
    
    setTimeout(async () => {
      const code = terminalOtp.trim();
      const foundRes = reservations.find(r => r.otp === code);
      
      if (foundRes) {
        if (foundRes.is_used) {
          setTerminalStatus('error');
          setTerminalMessage(`Fail: Key '${code}' is consumed.`);
          return;
        }
        
        try {
          await Promise.all([
            update(ref(database, `active_reservations/${foundRes.id}`), { is_used: true }).catch(() => {}),
            update(ref(database, `scheduled_reservations/${foundRes.id}`), { is_used: true }).catch(() => {})
          ]);

          const currentOcc = status.occupancy || 0;
          const capacity = status.capacity || 50;
          const nextOcc = Math.min(capacity, currentOcc + 1);
          
          await update(ref(database, 'library_status'), {
            occupancy: nextOcc,
            last_updated: new Date().toISOString()
          });

          setTerminalStatus('success');
          setTerminalMessage(`Granted: Welcome, ${foundRes.name}!`);
          setGateUnlocked(true);
          setTerminalOtp('');

          setTimeout(() => {
            setGateUnlocked(false);
          }, 4500);

        } catch (err: any) {
          setTerminalStatus('error');
          setTerminalMessage(`Sync error: ${err.message || 'database busy'}`);
        }
      } else {
        setTerminalStatus('error');
        setTerminalMessage(`Access Denied: Unrecognized Pin '${code}'.`);
      }
    }, 900);
  };

  const handleGuestTap = async (action: 'in' | 'out') => {
    setTerminalStatus('scanning');
    setTerminalMessage(action === 'in' ? 'Transmitting entry tap...' : 'Transmitting exit tap...');

    setTimeout(async () => {
      try {
        const currentOcc = status.occupancy || 0;
        const capacity = status.capacity || 50;
        
        let nextOcc = currentOcc;
        if (action === 'in') {
          nextOcc = Math.min(capacity, currentOcc + 1);
        } else {
          nextOcc = Math.max(0, currentOcc - 1);
        }

        await update(ref(database, 'library_status'), {
          occupancy: nextOcc,
          last_updated: new Date().toISOString()
        });

        setTerminalStatus('success');
        setTerminalMessage(action === 'in' ? 'Guest check-in recorded.' : 'Guest check-out recorded.');
        setGateUnlocked(true);

        setTimeout(() => {
          setGateUnlocked(false);
        }, 3500);

      } catch (err: any) {
        setTerminalStatus('error');
        setTerminalMessage(`Error: ${err.message || 'offline'}`);
      }
    }, 600);
  };

  // Real-time Listeners
  useEffect(() => {
    // 1. Library Status (from ESP32 / Admin)
    const statusRef = ref(database, 'library_status');
    const unsubscribeStatus = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setStatus(data);
    });

    // 2. Staff Presence
    const staffRef = ref(database, 'staff_presence');
    const unsubscribeStaff = onValue(staffRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
        setStaffList(list);
      } else {
        setStaffList([]);
      }
    });

    // 3. active_reservations and scheduled_reservations
    const activeResRef = ref(database, 'active_reservations');
    const unsubscribeActiveRes = onValue(activeResRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
        setActiveReservationsList(list);
      } else {
        setActiveReservationsList([]);
      }
    });

    const scheduledResRef = ref(database, 'scheduled_reservations');
    const unsubscribeScheduledRes = onValue(scheduledResRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
        setScheduledReservationsList(list);
      } else {
        setScheduledReservationsList([]);
      }
    });

    // 4. announcements
    const annRef = ref(database, 'announcements');
    const unsubscribeAnn = onValue(annRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAnnouncements(list);
      } else {
        setAnnouncements([]);
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeStaff();
      unsubscribeActiveRes();
      unsubscribeScheduledRes();
      unsubscribeAnn();
    };
  }, []);

  useEffect(() => {
    if (user && user.email) {
      setBookingName(user.email.split('@')[0]);
    }
  }, [user]);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Air Traffic Controller for Reservations
  useEffect(() => {
    const manageReservations = async () => {
      const currentTime = Date.now();

      try {
        // --- TASK 1: PROMOTE SCHEDULED TOKENS TO LIVE ---
        const scheduledRef = ref(database, 'scheduled_reservations');
        const schedSnapshot = await get(scheduledRef);
        
        if (schedSnapshot.exists()) {
          const scheduledOtps = schedSnapshot.val();
          
          Object.keys(scheduledOtps).forEach((otpKey) => {
            const otpData = scheduledOtps[otpKey];
            
            // If the start time has arrived (or passed)...
            if (currentTime >= otpData.start_time) {
              set(ref(database, `active_reservations/${otpKey}`), {
                ...otpData,
              });
              remove(ref(database, `scheduled_reservations/${otpKey}`));
              console.log(`OTP ${otpKey} is now ACTIVE at the door!`);
            }
          });
        }

        // --- TASK 2: DELETE EXPIRED/USED TOKENS ---
        const activeRef = ref(database, 'active_reservations');
        const activeSnapshot = await get(activeRef);
        
        if (activeSnapshot.exists()) {
          const activeOtps = activeSnapshot.val();
          
          Object.keys(activeOtps).forEach((otpKey) => {
            const otpData = activeOtps[otpKey];
            
            if (currentTime > otpData.end_time || otpData.is_used === true) {
               remove(ref(database, `active_reservations/${otpKey}`));
               console.log(`OTP ${otpKey} expired or used. Deleted from hardware queue.`);
            }
          });
        }
      } catch (error) {
        console.error("Reservation management failed: ", error);
      }
    };

    manageReservations();
    const intervalId = setInterval(manageReservations, 30000);

    return () => clearInterval(intervalId);
  }, []);

  // Filter all unused reservations (both active and scheduled/future ones) during the relevant time period
  const allUnusedReservations = reservations.filter(r => {
    if (r.is_used) return false;
    if (r.start_time !== undefined && r.end_time !== undefined) {
      return now >= r.start_time && now <= r.end_time;
    }
    return true; // legacy fallback
  });
  const unusedResCount = allUnusedReservations.length;
  const availableSeats = Math.max(0, status.capacity - status.occupancy - unusedResCount);
  const occupancyPercent = Math.round((status.occupancy / status.capacity) * 100);

  const handleBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (!bookingName.trim()) return;

    setIsBooking(true);
    
    // Safety timeout to prevent infinite loading
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), 10000)
    );

    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const resRef = ref(database, `scheduled_reservations/${otp}`);
      
      const [startTimeStr, endTimeStr] = bookingSlot.split(' - ');
      const [year, month, day] = bookingDate.split('-').map(Number);
      const [startHour, startMinute] = startTimeStr.split(':').map(Number);
      const [endHour, endMinute] = endTimeStr.split(':').map(Number);
      
      const startDateObj = new Date(year, month - 1, day, startHour, startMinute);
      const endDateObj = new Date(year, month - 1, day, endHour, endMinute);
      
      const startTimestamp = startDateObj.getTime();
      const endTimestamp = endDateObj.getTime();

      const newRes = {
        name: bookingName,
        time: bookingSlot,
        date: bookingDate,
        is_used: false,
        otp,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        start_time: startTimestamp,
        end_time: endTimestamp
      };
      
      await Promise.race([
        set(resRef, newRes),
        timeoutPromise
      ]);

      setBookingSuccess(otp);
      setBookingName(user.email?.split('@')[0] || '');
    } catch (error: any) {
      console.error("Booking error:", error);
      if (error.message === 'TIMEOUT') {
        alert("Connection timeout. Please check your internet and try again.");
      } else {
        alert("Failed to secure spot: " + (error.message || "Unknown error"));
      }
    } finally {
      setIsBooking(false);
    }
  };

  const handleStudentAuth = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthError(null);
    const email = studentEmail.toLowerCase() === 'admin' ? 'admin@seatidle.com' : studentEmail;
    try {
      if (authMode === 'login') {
        try {
          await signInWithEmailAndPassword(auth, email, studentPassword);
        } catch (err: any) {
          if (
            (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') && 
            email === 'admin@seatidle.com' && 
            studentPassword === 'admin123'
          ) {
            await createUserWithEmailAndPassword(auth, email, studentPassword);
          } else {
            throw err;
          }
        }
      } else {
        await createUserWithEmailAndPassword(auth, email, studentPassword);
      }
      setShowAuth(false);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setShowAuth(false);
    } catch (err: any) {
      setAuthError(err.message || 'Google Login failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!studentEmail.trim()) {
      setAuthError("Please input your email address in the credential field above first to send a password reset code.");
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);
    setResetSent(false);
    const email = studentEmail.toLowerCase() === 'admin' ? 'admin@seatidle.com' : studentEmail;
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      setAuthError(err.message || 'Could not dispatch password reset email. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const presentStaff = staffList.filter(s => s.is_present);

  const filteredStaff = staffList.filter(staff => 
    staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (staff.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (staff.department || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAnnouncements = announcements.filter(ann => 
    ann.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Generate 24 standard study desks
  const rawDesks = Array.from({ length: 24 }).map((_, i) => {
    const isOccupied = i < (status.occupancy || 0);
    const deskLetter = String.fromCharCode(65 + Math.floor(i / 6));
    const deskNum = (i % 6) + 1;
    
    let zone = '';
    let description = '';
    let guidelines: string[] = [];
    
    if (i < 6) {
      zone = 'Silence Zone A';
      description = 'Designated for deep concentration and silent study. No group discussions, video calls, or food are allowed.';
      guidelines = ['Always keep phones on silent mode', 'No whispering or collaborative talking', 'Beverages with lids only'];
    } else if (i < 12) {
      zone = 'Reference Reading Wing B';
      description = 'Perfect for reading journals, texts, and archive work with generous reading tables and natural lighting.';
      guidelines = ['Quiet pages flipping policy', 'No laptop audio output', 'Return reference books to the counter bin'];
    } else if (i < 18) {
      zone = 'STEM Technical Bay C';
      description = 'Equipped with dedicated Ethernet lines, high-density power ports, and workspace table sizes for hardware.';
      guidelines = ['Power strip adapters available at help desk', 'Laptop/hardware testing allowed', 'Recycle discarded wires'];
    } else {
      zone = 'Collaborative Hub D';
      description = 'A dynamic sharing zone meant for team project discussions, peer review sessions, and active whiteboard tutoring.';
      guidelines = ['Low-volume active speaking encouraged', 'Whiteboard markers provided', 'Maximum 2 hours per team group block'];
    }

    return {
      index: i,
      letter: deskLetter,
      num: deskNum,
      zone,
      description,
      isOccupied,
      guidelines
    };
  });

  // Apply Zone Filter
  const filteredDesks = rawDesks.filter(d => {
    if (activeZoneFilter === 'all') return true;
    return d.letter === activeZoneFilter;
  });

  const userResList = user ? reservations.filter(r => r.userId === user.uid && !r.is_used) : [];

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-5 md:p-8 space-y-6 md:space-y-8 pb-28 md:pb-8">
      
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-8 items-start">
        
        {/* Desktop Side Navigation Rail */}
        <aside className="hidden md:flex flex-col gap-6 sticky top-8">
          <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200/60 dark:border-slate-800 p-5 shadow-[0_4px_20px_rgb(0,0,0,0.012)] transition-all">
            <div className="flex items-center space-x-2 pb-1 bg-gradient-to-r from-brand-blue to-teal-500 bg-clip-text text-transparent">
              <Radio className="w-5 h-5 text-brand-blue animate-pulse animate-duration-1000" />
              <span className="text-[11px] font-black uppercase tracking-widest">Navigation Control</span>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">Click to pivot workspace views</p>
            
            <nav className="flex flex-col gap-1.5 mt-4">
              {[
                { id: 'live', label: 'Seat Live Map', icon: Radio, count: null },
                { id: 'reserve', label: 'Book Study Seat', icon: Calendar, count: userResList.length || null },
                { id: 'staff', label: 'Staff & Team', icon: Users, count: presentStaff.length || null, color: 'bg-brand-green/20 text-brand-green' },
                { id: 'notices', label: 'Library Notices', icon: Bell, count: announcements.length || null, color: 'bg-amber-500/20 text-amber-550' }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = dashboardTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setDashboardTab(tab.id as any);
                      setSearchQuery('');
                    }}
                    className={cn(
                      "flex items-center justify-between w-full px-3.5 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border text-left",
                      isActive 
                        ? "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700/60 font-black shadow-sm" 
                        : "bg-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 border-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn("w-4 h-4 shrink-0 transition-transform duration-200", isActive ? "text-brand-blue dark:text-brand-green stroke-[2.5]" : "text-slate-400")} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.count !== null && tab.count > 0 && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-black font-mono tracking-normal ml-1 border border-transparent",
                        tab.id === 'staff' ? "bg-brand-green/10 text-brand-green dark:bg-brand-green/20" : "bg-amber-500/10 text-amber-550 dark:bg-amber-500/20"
                      )}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="bg-slate-100/40 dark:bg-slate-900/40 rounded-[24px] border border-slate-200/45 dark:border-slate-800/60 p-5 select-none text-left">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <VolumeX className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest font-mono">Study Guidelines</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed mt-2">
              Scan RFID card on the SeatIdle hardware unit to check-in. Autocancel triggers if unused for 15 minutes.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-250/25 dark:border-slate-800/60 flex items-center justify-between text-[8px] font-bold text-slate-400 font-mono">
              <span>SeatIdle IoT</span>
              <span>v1.0.4-stable</span>
            </div>
          </div>
        </aside>

        {/* Column 2: Content Area */}
        <div className="space-y-6 md:space-y-8 min-w-0 flex-1">
          
          {/* Top Header Section with Welcome Text & Pulse Banner */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] md:rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 pb-0.5">
                  <span className="px-2.5 py-1 rounded-lg bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-green text-[9px] font-black uppercase tracking-wider">
                    IoT Desk Sync v1.0
                  </span>
                  <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse"></span>
                </div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                  SeatIdle Resource Command
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Real-time attendance intelligence, RFID desk matrix scheduling & notices dashboard.
                </p>
              </div>
            </div>

            {/* Dynamic Horizontal Announcements Banner */}
            {announcements.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800/85 mt-4 pt-4 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center space-x-2.5 text-slate-600 dark:text-slate-400 font-medium overflow-hidden">
                  <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="font-extrabold text-[9px] sm:text-[10px] uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0">
                    BULLETIN:
                  </span>
                  <p className="line-clamp-1 italic text-slate-705 dark:text-slate-300 truncate text-[11px] sm:text-xs">
                    {announcements[0].text}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setDashboardTab('notices')} 
                    className="text-[9px] uppercase tracking-widest font-black text-brand-blue dark:text-brand-green shrink-0 hover:underline hover:opacity-80 transition-all font-mono"
                  >
                    Feed →
                  </button>
                </div>
              </div>
            )}
          </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={dashboardTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2 }}
        >
          {dashboardTab === 'live' && (
            <div className="max-w-2xl mx-auto w-full">
              
              {/* Seating Metrics Ring Widget (Highly Responsive Setup) */}
              <div id="seating-metrics" className="bg-white dark:bg-slate-900 rounded-[28px] md:rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-5 md:p-8 flex flex-col justify-between relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-colors">
                <div className="absolute top-0 left-0 w-full h-1 bg-brand-blue"></div>
                <div className="absolute -right-24 -bottom-24 w-96 h-96 bg-brand-blue/5 dark:bg-brand-blue/10 rounded-full opacity-50 blur-[100px] pointer-events-none"></div>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Dynamic Availability</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Real-time attendance metrics</p>
                  </div>
                  {isAdmin && (
                    <a
                      href="/admin"
                      className="bg-brand-blue hover:bg-brand-blue/95 text-white dark:bg-brand-blue/20 dark:hover:bg-brand-blue/30 dark:text-brand-green px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-sm border border-brand-blue/10 dark:border-brand-green/20"
                    >
                      <Lock className="w-3 h-3" />
                      Admin
                    </a>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                  {/* Circular visual ring (compact on smaller viewports) */}
                  <div className="relative w-36 h-36 sm:w-40 sm:h-40 md:w-48 md:h-48 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="50%" cy="50%" r="41%" strokeWidth="8" stroke="currentColor" className="text-slate-100 dark:text-slate-800" fill="transparent" />
                      <circle cx="50%" cy="50%" r="41%" strokeWidth="10" stroke="currentColor" strokeDasharray={`${2 * Math.PI * 41}`} strokeDashoffset={`${2 * Math.PI * 41 * (1 - occupancyPercent / 100)}`} className={cn("transition-all duration-1000 ease-out", occupancyPercent > 90 ? "text-red-500" : occupancyPercent > 70 ? "text-amber-500" : "text-brand-green")} fill="transparent" strokeLinecap="round" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-4xl sm:text-5xl font-black text-slate-800 dark:text-white tracking-tighter">{availableSeats}</span>
                      <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest mt-0.5">Desks Free</span>
                    </div>
                  </div>

                  {/* Quantitative Layout Bars (Fully Stacked on Mobile) */}
                  <div className="space-y-4 flex-1 w-full">
                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                        <span>Space Occupancy</span>
                        <span className={cn("font-mono font-black", occupancyPercent > 90 ? "text-red-500" : occupancyPercent > 70 ? "text-amber-500" : "text-brand-green")}>
                          {occupancyPercent}%
                        </span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${occupancyPercent}%` }}
                          className={cn(
                            "h-full rounded-full transition-all duration-1000 shadow-inner",
                            occupancyPercent > 90 ? "bg-red-500" : occupancyPercent > 70 ? "bg-amber-500" : "bg-brand-green"
                          )}
                        ></motion.div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 pt-1.5 text-center">
                      <div className="bg-slate-50/50 dark:bg-slate-850 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Present</span>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200">{status?.occupancy || 0}</p>
                      </div>
                      <div className="bg-slate-50/50 dark:bg-slate-850 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Booked</span>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200">{unusedResCount}</p>
                      </div>
                      <div className="bg-slate-50/50 dark:bg-slate-850 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Total</span>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200">{status?.capacity || 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {dashboardTab === 'reserve' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Premium Interactive Booking Panel */}
              <div id="booking-portal" className="col-span-1 lg:col-span-12 xl:col-span-6 bg-brand-blue dark:bg-[#0a3551] rounded-[28px] md:rounded-[40px] p-5 sm:p-6 md:p-8 text-white shadow-2xl relative overflow-hidden flex flex-col justify-between">
                <div className="absolute -right-20 -top-20 w-52 h-52 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.25em] mb-6 flex items-center text-brand-green select-none">
                    <span className="w-1.5 h-5 bg-brand-green mr-2.5 rounded-full inline-block"></span>
                    Seat Scheduling Portal
                  </h3>

                  <AnimatePresence mode="wait">
                    {bookingSuccess ? (
                      <motion.div 
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white/10 backdrop-blur-md border border-white/20 rounded-[24px] md:rounded-[32px] p-5 sm:p-6 text-center my-2"
                      >
                        <div className="w-14 h-14 bg-brand-green rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-green/20 rotate-6 shrink-0">
                          <CheckCircle2 className="w-7 h-7 text-white -rotate-6" />
                        </div>
                        <h4 className="text-lg font-black mb-1 uppercase tracking-tight">Access Token Ready</h4>
                        <p className="text-brand-green/90 text-xs font-bold mb-4">Verification key is active for entry doors</p>
                        <div className="bg-white px-6 py-3.5 rounded-xl inline-block shadow-xl">
                          <span className="text-2xl font-mono font-black text-brand-blue tracking-[0.4em] pl-2">{bookingSuccess}</span>
                        </div>
                        <button 
                          onClick={() => setBookingSuccess(null)}
                          className="w-full mt-5 bg-white/15 hover:bg-white/25 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all"
                        >
                          Confirm & Back to Form
                        </button>
                      </motion.div>
                    ) : !user || showAuth ? (
                      <motion.div 
                        key="auth"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className="bg-white/10 p-4 sm:p-5 rounded-[24px] border border-white/15 text-center backdrop-blur-sm">
                          <p className="text-[11px] font-bold text-brand-green mb-4 px-2 select-none leading-relaxed">
                            Please sign in or register to securely book RFID access keys and check-in.
                          </p>
                          <div className="flex bg-white/10 rounded-xl p-1 mb-4 border border-white/5">
                            <button 
                              type="button"
                              onClick={() => setAuthMode('login')}
                              className={cn(
                                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                authMode === 'login' ? "bg-white text-brand-blue shadow-sm" : "text-white/60 hover:text-white"
                              )}
                            >
                              Login
                            </button>
                            <button 
                              type="button"
                              onClick={() => setAuthMode('signup')}
                              className={cn(
                                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                authMode === 'signup' ? "bg-white text-brand-blue shadow-sm" : "text-white/60 hover:text-white"
                              )}
                            >
                              Sign Up
                            </button>
                          </div>

                          <form onSubmit={handleStudentAuth} className="space-y-3">
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                              <input 
                                type="text" 
                                required
                                value={studentEmail}
                                onChange={(e) => setStudentEmail(e.target.value)}
                                placeholder="Admin or University Email"
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-base md:text-xs placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-brand-green/50 transition-all font-medium text-white"
                              />
                            </div>
                            <div className="relative">
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                              <input 
                                type="password" 
                                required={authMode === 'login'}
                                value={studentPassword}
                                onChange={(e) => setStudentPassword(e.target.value)}
                                placeholder="Password"
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-base md:text-xs placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-brand-green/50 transition-all font-medium text-white"
                              />
                            </div>
                            {authMode === 'login' && (
                              <div className="flex justify-end px-1 mt-0.5">
                                <button
                                  type="button"
                                  onClick={handleForgotPassword}
                                  className="text-[9px] font-black text-brand-green hover:text-brand-green/85 cursor-pointer select-none transition-colors uppercase tracking-widest"
                                  title="Reset password of the entered email via inbox"
                                >
                                  Forgot Password?
                                </button>
                              </div>
                            )}
                            {resetSent && (
                              <motion.p 
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-emerald-400 text-[9px] font-black uppercase tracking-widest bg-emerald-400/10 py-2.5 rounded-lg border border-emerald-400/20 px-3 text-center leading-relaxed"
                              >
                                Reset link dispatched! Check your inbox.
                              </motion.p>
                            )}
                            {authError && (
                              <motion.p 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-red-400 text-[9px] font-black uppercase tracking-widest bg-red-400/10 py-1.5 rounded-lg"
                              >
                                {authError}
                              </motion.p>
                            )}
                            <button 
                              disabled={isAuthenticating}
                              className="w-full bg-brand-green text-slate-950 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all hover:bg-brand-green/90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center mt-2"
                            >
                              {isAuthenticating ? <Loader size="sm" light className="mr-2" /> : null}
                              {authMode === 'login' ? 'Access Account' : 'Initialize Profile'}
                            </button>

                            <div className="relative my-3">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                              </div>
                              <div className="relative flex justify-center text-[7px] uppercase font-black text-white/25 tracking-[0.3em]">
                                <span className="bg-[#0f4c75] dark:bg-[#0a3551] px-2">Sync Gateway</span>
                              </div>
                            </div>

                            <button 
                              type="button"
                              onClick={handleGoogleLogin}
                              disabled={isAuthenticating}
                              className="w-full flex justify-center items-center gap-2 bg-white text-slate-800 rounded-xl px-4 py-3 hover:bg-white/95 transition-all font-black text-[10px] shadow-sm disabled:opacity-50 uppercase tracking-widest"
                            >
                              {isAuthenticating ? <Loader size="sm" className="mr-1" /> : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                              )}
                              Google Sync
                            </button>
                          </form>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.form 
                        key="form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onSubmit={handleBooking} 
                        className="space-y-4"
                      >
                        <div className="space-y-3.5">
                          <div>
                            <label className="text-[9px] font-bold uppercase text-brand-green block mb-1 p-0.5 tracking-widest">Student Name Mapping</label>
                            <input 
                              type="text" 
                              required
                              value={bookingName}
                              onChange={(e) => setBookingName(e.target.value)}
                              placeholder="e.g. John Doe" 
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base md:text-xs placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-brand-green/45 transition-all font-bold text-white shadow-inner"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label className="text-[9px] font-bold uppercase text-brand-green block mb-1 p-0.5 tracking-widest">Reservation Date</label>
                              <input 
                                type="date" 
                                required
                                value={bookingDate}
                                onChange={(e) => setBookingDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-brand-green/45 cursor-pointer font-bold text-white transition-all hover:bg-white/10"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold uppercase text-brand-green block mb-1 p-0.5 tracking-widest">Preferred Window</label>
                              <div className="relative">
                                <select 
                                  value={bookingSlot}
                                  onChange={(e) => setBookingSlot(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base md:text-xs focus:outline-none focus:ring-1 focus:ring-brand-green/45 appearance-none cursor-pointer font-black text-white/90 transition-all hover:bg-white/10 pr-10"
                                >
                                  <option className="text-slate-800" value="08:00 - 10:00">Session A: 08:00 - 10:00</option>
                                  <option className="text-slate-800" value="10:00 - 12:00">Session B: 10:00 - 12:00</option>
                                  <option className="text-slate-800" value="12:00 - 14:00">Session C: 12:00 - 14:00</option>
                                  <option className="text-slate-800" value="14:00 - 16:00">Session D: 14:00 - 16:00</option>
                                  <option className="text-slate-800" value="16:00 - 18:00">Session E: 16:00 - 18:00</option>
                                </select>
                                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <button 
                          disabled={isBooking}
                          className="w-full bg-white text-brand-blue hover:bg-brand-green hover:text-slate-950 font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center mt-2 shadow-md"
                        >
                          {isBooking ? <Loader size="sm" className="mr-2" /> : null}
                          {isBooking ? 'Registering Spot...' : 'Claim Entry Pass'}
                        </button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>

                {user && !bookingSuccess && (
                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center space-x-2.5 text-[9px] text-white/60 select-none">
                    <ShieldCheck className="w-4 h-4 text-brand-green flex-shrink-0" />
                    <p className="font-bold leading-tight">University portal linked profile. Confirm check-in by scanning matching RFID tags at entry doors.</p>
                  </div>
                )}
              </div>

              {/* Right Column: Personal Active Boarding Passes Cards Folder */}
              <div id="active-permits" className="col-span-1 lg:col-span-12 xl:col-span-6 bg-white dark:bg-slate-900 rounded-[28px] md:rounded-[30px] border border-slate-200/60 dark:border-slate-800 p-5 md:p-8 flex flex-col justify-between shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800/80">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">My Dynamic Tickets</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium select-none">Manage active RFID scheduling credentials</p>
                    </div>
                    {user && (
                      <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-black uppercase">
                        ID: {user.uid.slice(0, 6)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                    {user ? (
                      userResList.length === 0 ? (
                        <div className="py-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-850/80 rounded-2xl bg-slate-50/20 dark:bg-slate-900/30">
                          <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest select-none">No Active Passes</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-6">Book your desired window using the portal card on the left.</p>
                        </div>
                      ) : (
                        userResList.map(res => (
                          /* Boarding Pass Layout with Custom Notches and barcode */
                          <div 
                            key={res.id} 
                            className="relative flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_4px_12px_rgb(0,0,0,0.01)] hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                          >
                            
                            {/* Left/Main pass details half */}
                            <div className="flex-1 p-4 flex flex-col justify-between space-y-3 z-10">
                              <div className="space-y-1.5">
                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                  <span className="bg-brand-blue/10 dark:bg-brand-green/20 text-brand-blue dark:text-brand-green text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-brand-blue/5 dark:border-brand-green/10">
                                    {res.date}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400 font-extrabold text-[9px] font-mono tracking-wide">
                                    {res.time}
                                  </span>
                                  {res.start_time !== undefined && res.end_time !== undefined ? (
                                    now >= res.start_time && now <= res.end_time ? (
                                      <span className="bg-brand-green/10 text-brand-green border border-brand-green/20 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                        <span className="w-1.5 h-1.5 bg-brand-green rounded-full"></span>
                                        Live Now
                                      </span>
                                    ) : now < res.start_time ? (
                                      <span className="bg-brand-blue/10 text-brand-blue border border-brand-blue/20 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-brand-blue rounded-full"></span>
                                        Upcoming
                                      </span>
                                    ) : (
                                      <span className="bg-slate-100 dark:bg-slate-850 text-slate-400 border border-slate-200/50 dark:border-slate-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                                        Expired
                                      </span>
                                    )
                                  ) : null}
                                </div>
                                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate max-w-[220px]">
                                  {res.name}
                                </h4>
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block font-mono">
                                  RFID Gate: North Wing 2
                                </span>
                              </div>

                              <div className="pt-1.5">
                                {confirmingId === res.id ? (
                                  <div className="flex items-center space-x-1.5">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await Promise.all([
                                            remove(ref(database, `active_reservations/${res.id}`)),
                                            remove(ref(database, `scheduled_reservations/${res.id}`))
                                          ]);
                                        } catch (err) {
                                          console.error(err);
                                        } finally {
                                          setConfirmingId(null);
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-red-500 text-white text-[8px] font-black uppercase tracking-widest rounded transition-all"
                                    >
                                      Confirm Revoke
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmingId(null)}
                                      className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[8px] font-black uppercase tracking-widest rounded transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingId(res.id)}
                                    className="px-2.5 py-1 bg-red-500/5 hover:bg-red-500 hover:text-white border border-red-500/10 text-[8px] font-black text-red-500 uppercase tracking-widest rounded transition-all"
                                  >
                                    Revoke Slot
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Responsive Notch Divider dashed line */}
                            <div className="relative flex items-center justify-center shrink-0 w-full sm:w-auto">
                              {/* Left cutout circle for mobile */}
                              <div className="absolute left-[-11px] top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-200/60 dark:border-slate-800 z-10 sm:hidden"></div>
                              {/* Right cutout circle for mobile */}
                              <div className="absolute right-[-11px] top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-200/60 dark:border-slate-800 z-10 sm:hidden"></div>

                              {/* Top cutout circle for desktop wide */}
                              <div className="absolute top-[-11px] left-1/2 -translate-x-1/2 w-5 h-5 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-200/60 dark:border-slate-800 z-10 hidden sm:block"></div>
                              {/* Bottom cutout circle for desktop wide */}
                              <div className="absolute bottom-[-11px] left-1/2 -translate-x-1/2 w-5 h-5 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-200/60 dark:border-slate-800 z-10 hidden sm:block"></div>

                              {/* Dashed lines */}
                              <div className="w-full sm:w-[1px] h-[1px] sm:h-full border-t border-dashed sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 my-1 sm:my-0 sm:mx-1 flex-1"></div>
                            </div>

                            {/* Right ticket passcode + mock barcode half */}
                            <div className="p-4 bg-slate-100/50 dark:bg-slate-900/60 flex flex-col items-center justify-around space-y-3 shrink-0 sm:w-44 z-10 text-center">
                              <span className="text-[8px] font-black text-[#84cc16] dark:text-brand-green tracking-[0.2em] uppercase font-mono">
                                Pass Code Token
                              </span>

                              <button
                                type="button"
                                onClick={() => handleCopyOtp(res.otp)}
                                className="font-mono font-black text-base tracking-[0.25em] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 px-4 py-1.5 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all w-full select-all text-slate-800 dark:text-slate-150"
                                title="Copy Passcode"
                              >
                                <span>{res.otp}</span>
                                {copiedOtp === res.otp ? (
                                  <Check className="w-3.5 h-3.5 text-brand-green" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                                )}
                              </button>

                              {/* Barcode Mock Rendering */}
                              <div className="flex items-center justify-center gap-0.5 h-8 w-full bg-white dark:bg-slate-955 p-1.5 rounded border border-slate-100 dark:border-slate-800 select-none">
                                {Array.from({ length: 24 }).map((_, idx) => (
                                  <div 
                                    key={idx} 
                                    className={cn(
                                      "bg-slate-800 dark:bg-slate-250 h-full",
                                      idx % 3 === 0 ? "w-[1px]" : idx % 4 === 0 ? "w-[3px]" : "w-[2px]",
                                      (idx + 1) % 6 === 0 ? "opacity-0" : ""
                                    )}
                                  />
                                ))}
                              </div>
                            </div>

                          </div>
                        ))
                      )
                    ) : (
                      <div className="py-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-850/80 rounded-2xl bg-slate-50/20 dark:bg-slate-900/30">
                        <Lock className="w-8 h-8 text-slate-350 dark:text-slate-750 mx-auto mb-2" />
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest select-none">Sign In Required</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Please log in to query matching active RFID records.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-xl flex items-start space-x-2 text-[9px] text-amber-600 dark:text-amber-450 leading-relaxed font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p>NOTICE: Desk entries are reserved for University Members. Misuse, no-shows or key sharing may result in security profile restrictions.</p>
                </div>
              </div>

            </div>
          )}

          {dashboardTab === 'staff' && (
            <div className="bg-white dark:bg-slate-900 rounded-[28px] md:rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-5 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Help Desk & Duty Team</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 font-medium">Verify online helper experts currently inside the library wing</p>
                </div>
                
                {/* Search Box */}
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search helper name or dept..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-850 pl-9 pr-4 py-2 rounded-xl text-base md:text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-semibold shadow-inner"
                  />
                </div>
              </div>

              {/* Dynamic Staff Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 pt-1">
                {filteredStaff.length > 0 ? (
                  filteredStaff.map(staff => (
                    <div 
                      key={staff.id} 
                      className={cn(
                        "p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3.5 relative overflow-hidden group/card",
                        staff.is_present 
                          ? "bg-brand-green/5 hover:border-brand-green/30 border-brand-green/15" 
                          : "bg-slate-50/50 hover:border-slate-200 dark:bg-slate-900/30 border-slate-100/80 dark:border-slate-850"
                      )}
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-slate-100 dark:bg-slate-805 rounded-full blur-xl opacity-45 pointer-events-none transition-all"></div>
                      
                      <div className="flex items-start space-x-3.5 z-10">
                        <div className="w-11 h-11 rounded-xl bg-brand-blue text-white dark:bg-brand-blue/20 dark:text-brand-green flex items-center justify-center font-black text-xs shadow-inner shrink-0 relative">
                          {(staff.name || 'Staff').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || 'ST'}
                          <span className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900",
                            staff.is_present ? "bg-brand-green" : "bg-slate-305"
                          )}></span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-850 dark:text-white truncate text-xs sm:text-sm">{staff.name}</p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-widest mt-0.5 truncate">
                            {staff.role || 'Staff Member'}
                          </p>
                          <span className="text-[8px] font-mono font-bold text-slate-400 dark:text-slate-500 mt-1 block select-none">
                            Dept: {staff.department || 'General Services'}
                          </span>
                        </div>
                      </div>

                      <div className="z-10 border-t border-slate-100 dark:border-slate-800 pt-2.5 flex items-center justify-between text-[11px] select-none">
                        <div className="flex items-center space-x-1.5 font-bold uppercase text-[9px] tracking-wider">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full inline-block",
                            staff.is_present ? "bg-brand-green shadow-[0_0_6px_#2dd4bf] animate-pulse" : "bg-slate-300"
                          )}></span>
                          <span className={staff.is_present ? "text-brand-green" : "text-slate-400"}>
                            {staff.is_present ? 'Active Now' : 'Away'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {staff.email && (
                            <a
                              href={`mailto:${staff.email}`}
                              className="px-2 py-1 bg-slate-100 dark:bg-slate-850 hover:bg-brand-blue/10 hover:text-brand-blue dark:hover:bg-brand-green/20 dark:hover:text-brand-green text-slate-700 dark:text-slate-300 rounded text-[8px] font-black uppercase tracking-wider transition-all border border-slate-200/50 dark:border-slate-750"
                              title="Email staff helper"
                            >
                              Email
                            </a>
                          )}
                          {staff.phone && (
                            <a
                              href={`tel:${staff.phone}`}
                              className="px-2 py-1 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded text-[8px] font-black uppercase tracking-wider transition-all border border-slate-200/50 dark:border-slate-750"
                              title="Call staff helper"
                            >
                              Call
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-850 rounded-2xl bg-slate-50/20">
                    <Users className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest select-none">No Helpers Found</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 select-none">Try broadening your helper name search guidelines.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {dashboardTab === 'notices' && (
            <div className="bg-white dark:bg-slate-900 rounded-[28px] md:rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-5 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Official Announcements</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 font-medium">Read central library study slot alerts and RFID matrix updates</p>
                </div>
                
                {/* Search */}
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter bulletins..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-850 pl-09 pr-4 py-2 rounded-xl text-base md:text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-semibold shadow-inner"
                  />
                </div>
              </div>

              {/* Announcements stream */}
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 pt-1">
                {filteredAnnouncements.length > 0 ? (
                  filteredAnnouncements.map((ann, idx) => (
                    <div 
                      key={ann.id} 
                      className={cn(
                        "p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden group",
                        idx === 0 
                          ? "bg-amber-500/5 dark:bg-amber-955/10 border-amber-500/25 dark:border-amber-800 shadow-sm" 
                          : "bg-slate-50/50 dark:bg-slate-900/30 border-slate-100/85 dark:border-slate-850"
                      )}
                    >
                      {idx === 0 && (
                        <div className="absolute top-4 right-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider select-none animate-pulse">
                          Pinned Bulletin
                        </div>
                      )}
                      <p className={cn(
                        "text-xs sm:text-sm leading-relaxed max-w-4xl pr-14",
                        idx === 0 ? "text-slate-850 dark:text-slate-100 font-bold" : "text-slate-655 dark:text-slate-400 font-medium"
                      )}>
                        {ann.text}
                      </p>
                      
                      <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-3.5 uppercase tracking-widest flex items-center space-x-1.5 select-none font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                        <span>
                          {new Date(ann.createdAt).toLocaleDateString('en-LK', { dateStyle: 'medium', timeZone: 'Asia/Colombo' })}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(ann.createdAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center border-2 border-dashed border-slate-150 dark:border-slate-850 rounded-2xl bg-slate-50/10">
                    <Megaphone className="w-8 h-8 text-slate-350 dark:text-slate-750 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest select-none">No Notices Published</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 select-none">Check back later for RFID scheduled guidelines.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

        </div>
      </div>

      {/* Bottom Padding spacer */}
      <div className="h-4 select-none"></div>

      {/* Dynamic Accessible Bottom Navigation Bar for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-3 pt-2 pb-5 flex items-center justify-around select-none">
        {[
          { id: 'live', label: 'Seat Live', icon: Radio, count: null },
          { id: 'reserve', label: 'Reserve', icon: Calendar, count: userResList.length || null },
          { id: 'staff', label: 'Staff', icon: Users, count: presentStaff.length || null, color: 'bg-brand-green' },
          { id: 'notices', label: 'Notices', icon: Bell, count: announcements.length || null, color: 'bg-amber-500' }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = dashboardTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setDashboardTab(tab.id as any);
                setSearchQuery('');
              }}
              className="relative py-1 flex flex-col items-center justify-center active:scale-95 transition-all text-center flex-1 h-12"
            >
              {isActive && (
                <motion.div 
                  layoutId="activeTabPill" 
                  className="absolute -top-[10px] w-8 h-[3px] bg-brand-blue dark:bg-brand-green rounded-full shadow-[0_0_8px_#2dd4bf]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}

              <Icon className={cn(
                "w-5 h-5 transition-transform duration-200", 
                isActive 
                  ? "text-brand-blue dark:text-brand-green scale-110 stroke-[2.5]" 
                  : "text-slate-400 dark:text-slate-500"
              )} />
              
              <span className={cn(
                "text-[9px] font-black uppercase tracking-wider mt-1",
                isActive 
                  ? "text-slate-900 dark:text-white font-black" 
                  : "text-slate-400 dark:text-slate-500 font-bold"
              )}>
                {tab.label}
              </span>

              {tab.count !== null && tab.count > 0 && (
                <span className={cn(
                  "absolute top-0.5 right-1/4 translate-x-2 px-1.5 py-0.5 rounded-full text-[8px] font-black font-mono text-white tracking-normal scale-90",
                  tab.color || 'bg-brand-blue'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
