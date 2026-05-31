import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth, database, ref, onValue, set, push, remove, update, get } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Users, Calendar, Plus, Trash2, LogIn, Lock, LogOut, Mail, Save, AlertTriangle, TrendingUp, BarChart3, PieChart, X, Clock, Phone, SlidersHorizontal, Bell } from 'lucide-react';
import { cn } from '../lib/utils';
import { Loader } from '../components/ui/Loader';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Types
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
  date?: string;
  is_used: boolean;
  otp: string;
  userId?: string;
  createdAt?: string;
  start_time?: number;
  end_time?: number;
}

export function Admin() {
  const { user, loading } = useAuth();
  
  const ALLOWED_ADMINS = ['admin@seatidle.com', 'genukakisara@gmail.com'];
  const isAdmin = user && ALLOWED_ADMINS.includes(user.email || '');

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Database State (Empty Defaults)
  const [status, setStatus] = useState<LibraryStatus>({
    capacity: 0,
    occupancy: 0,
    system_online: true
  });
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [activeReservationsList, setActiveReservationsList] = useState<Reservation[]>([]);
  const [scheduledReservationsList, setScheduledReservationsList] = useState<Reservation[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Merge active and scheduled reservations safely (with uniqueness by ID)
  const reservations = (() => {
    const all = [...activeReservationsList, ...scheduledReservationsList];
    const map = new Map();
    all.forEach(item => {
      map.set(item.id, item);
    });
    return Array.from(map.values()) as Reservation[];
  })();

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Edit State
  const [editCapacity, setEditCapacity] = useState('0');
  const [editOccupancy, setEditOccupancy] = useState('0');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUid, setNewStaffUid] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');
  const [newStaffDept, setNewStaffDept] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');

  // Selected Staff inspection and edit states
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState('');
  const [editStaffDept, setEditStaffDept] = useState('');
  const [editStaffEmail, setEditStaffEmail] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');

  const [announcementText, setAnnouncementText] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'capacity' | 'staff' | 'notices' | 'reports'>('capacity');
  const [confirmingStaffId, setConfirmingStaffId] = useState<string | null>(null);
  const [confirmingReservationId, setConfirmingReservationId] = useState<string | null>(null);

  // Loading States
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [isAddingAnnouncement, setIsAddingAnnouncement] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);

  // Database Listeners
  useEffect(() => {
    if (!user || !isAdmin) return;

    // 1. Library Status
    const statusRef = ref(database, 'library_status');
    const unsubscribeStatus = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStatus(data);
        setEditCapacity((data.capacity ?? 50).toString());
        setEditOccupancy((data.occupancy ?? 0).toString());
      }
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
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setAnnouncements(list);
      } else {
        setAnnouncements([]);
      }
    });

    // 5. history
    const historyRef = ref(database, 'occupancy_history');
    const unsubscribeHistory = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => {
          if (!val || typeof val !== 'object') return null;
          const tsStr = val.timestamp || val.createdAt;
          if (!tsStr) return null;
          const dateObj = new Date(tsStr);
          if (isNaN(dateObj.getTime())) return null;
          return { 
            timestamp: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fullDate: tsStr,
            occupancy: typeof val.occupancy === 'number' ? val.occupancy : 0 
          };
        })
        .filter((item): item is any => item !== null)
        .sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
        
        // Take last 24 entries for a "recent" trend
        setHistoryData(list.slice(-24));
      } else {
        setHistoryData([]);
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeStaff();
      unsubscribeActiveRes();
      unsubscribeScheduledRes();
      unsubscribeAnn();
      unsubscribeHistory();
    };
  }, [user, isAdmin]);

  // History Logger logic
  useEffect(() => {
    if (!isAdmin || !status.occupancy) return;
    
    // Auto-log history every 30 mins or on manual update
    const lastLogTime = localStorage.getItem('last_history_log');
    const now = Date.now();
    
    if (!lastLogTime || (now - parseInt(lastLogTime)) > 1000 * 60 * 30) {
      const historyRef = ref(database, 'occupancy_history');
      push(historyRef, {
        timestamp: new Date().toISOString(),
        occupancy: status.occupancy
      });
      localStorage.setItem('last_history_log', now.toString());
    }
  }, [status.occupancy, isAdmin]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError(null);
    const targetEmail = email.toLowerCase() === 'admin' ? 'admin@seatidle.com' : email;
    try {
      await signInWithEmailAndPassword(auth, targetEmail, password);
    } catch (err: any) {
      // Auto-create Admin account if requested credentials are the standard Admin/admin123
      if (
        (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') && 
        targetEmail === 'admin@seatidle.com' && 
        password === 'admin123'
      ) {
        try {
          await createUserWithEmailAndPassword(auth, 'admin@seatidle.com', 'admin123');
          return;
        } catch (createErr: any) {
          setAuthError(createErr.message);
          return;
        }
      }
      setAuthError(err.message || 'Failed to login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Gatekeeper logic
      const ALLOWED_ADMINS = ['admin@seatidle.com', 'genukakisara@gmail.com'];
      if (!ALLOWED_ADMINS.includes(user.email || '')) {
        setAuthError('Access Denied: You do not have administrator privileges.');
        await auth.signOut();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Google Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setAuthError("Please input your email address in the credential field above first to send a password reset code.");
      return;
    }
    setIsLoggingIn(true);
    setAuthError(null);
    setResetSent(false);
    const targetEmail = email.toLowerCase() === 'admin' ? 'admin@seatidle.com' : email;
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setResetSent(true);
    } catch (err: any) {
      setAuthError(err.message || 'Could not dispatch password reset email. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const updateStatus = async () => {
    setIsUpdatingStatus(true);
    try {
      const statusRef = ref(database, 'library_status');
      const timestamp = new Date().toISOString();
      const newStatus = {
        capacity: parseInt(editCapacity) || 50,
        occupancy: parseInt(editOccupancy) || 0,
        system_online: true,
        last_updated: timestamp
      };
      await set(statusRef, newStatus);
      
      // Also log to history immediately on manual change
      const historyRef = ref(database, 'occupancy_history');
      await push(historyRef, {
        timestamp,
        occupancy: newStatus.occupancy
      });
      localStorage.setItem('last_history_log', Date.now().toString());

      alert('Status updated and logged successfully');
    } catch (err) {
      console.error("Update error:", err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Sync selected staff state with background listener updates for real-time updates of details/logs
  useEffect(() => {
    if (selectedStaff) {
      const updated = staffList.find(s => s.id === selectedStaff.id);
      if (updated) {
        setSelectedStaff(updated);
      }
    }
  }, [staffList]);

  const toggleStaffPresence = async (id: string, current: boolean) => {
    try {
      const staffMemberRef = ref(database, `staff_presence/${id}`);
      const timestamp = new Date().toISOString();
      await update(staffMemberRef, { 
        is_present: !current,
        last_updated: timestamp
      });
      
      const logsRef = ref(database, `staff_presence/${id}/logs`);
      await push(logsRef, {
        timestamp,
        status: !current ? 'IN' : 'OUT',
        method: 'ADMIN_OVERRIDE'
      });
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const addStaff = async () => {
    if (!newStaffName.trim()) {
      alert("Please enter a staff name.");
      return;
    }
    if (!newStaffUid.trim()) {
      alert("Please enter an RFID Card UID.");
      return;
    }
    setIsAddingStaff(true);
    try {
      const formattedUid = newStaffUid.trim().toUpperCase();
      const staffMemberRef = ref(database, `staff_presence/${formattedUid}`);
      const timestamp = new Date().toISOString();
      
      const newStaffObj = {
        name: newStaffName.trim(),
        role: newStaffRole.trim() || 'Staff Member',
        department: newStaffDept.trim() || 'General',
        email: newStaffEmail.trim() || 'staff@seatidle.edu',
        phone: newStaffPhone.trim() || '+94 77 123 4567',
        joined_date: timestamp,
        is_present: false,
        last_updated: timestamp
      };

      await set(staffMemberRef, newStaffObj);

      // Create initial log
      const logsRef = ref(database, `staff_presence/${formattedUid}/logs`);
      await push(logsRef, {
        timestamp,
        status: 'OUT',
        method: 'INITIAL_REGISTRATION'
      });

      setNewStaffName('');
      setNewStaffUid('');
      setNewStaffRole('');
      setNewStaffDept('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      alert("Staff registered successfully!");
    } catch (err) {
      console.error("Add staff error:", err);
      alert("Failed to add staff member.");
    } finally {
      setIsAddingStaff(false);
    }
  };

  const updateStaffProfile = async (id: string) => {
    if (!editStaffName.trim()) {
      alert("Name is required.");
      return;
    }
    try {
      const staffMemberRef = ref(database, `staff_presence/${id}`);
      const timestamp = new Date().toISOString();
      await update(staffMemberRef, {
        name: editStaffName.trim(),
        role: editStaffRole.trim() || 'Staff Member',
        department: editStaffDept.trim() || 'General',
        email: editStaffEmail.trim() || 'staff@seatidle.edu',
        phone: editStaffPhone.trim() || '+94 77 123 4567',
        last_updated: timestamp
      });
      setIsEditingProfile(false);
      alert("Staff profile updated successfully!");
    } catch (err) {
      console.error("Update profile error:", err);
      alert("Failed to update profile.");
    }
  };

  const addManualLog = async (id: string, status: 'IN' | 'OUT', customMethod: string = 'MANUAL_ENTRY') => {
    try {
      const timestamp = new Date().toISOString();
      const isPresent = status === 'IN';
      
      const staffMemberRef = ref(database, `staff_presence/${id}`);
      await update(staffMemberRef, { 
        is_present: isPresent,
        last_updated: timestamp
      });
      
      const logsRef = ref(database, `staff_presence/${id}/logs`);
      await push(logsRef, {
        timestamp,
        status,
        method: customMethod
      });
    } catch (err) {
      console.error("Add manual log error:", err);
      alert("Failed to record manual log.");
    }
  };

  const deleteStaff = async (id: string) => {
    if (confirm('Are you sure you want to remove this staff member?')) {
      try {
        await remove(ref(database, `staff_presence/${id}`));
      } catch (err) {
        console.error("Delete staff error:", err);
      }
    }
  };

  const deleteReservation = async (id: string) => {
    if (confirm('Are you sure you want to delete this reservation?')) {
      try {
        await Promise.all([
          remove(ref(database, `active_reservations/${id}`)).catch(err => {
            console.warn("Admin could not delete active reservation: ", err);
          }),
          remove(ref(database, `scheduled_reservations/${id}`)).catch(err => {
            console.warn("Admin could not delete scheduled reservation: ", err);
          })
        ]);
      } catch (err) {
        console.error("Delete reservation error:", err);
      }
    }
  };

  const markReservationUsed = async (id: string) => {
    try {
      await Promise.all([
        update(ref(database, `active_reservations/${id}`), { is_used: true }).catch(err => {
          console.warn("Admin could not mark active reservation as used: ", err);
        }),
        update(ref(database, `scheduled_reservations/${id}`), { is_used: true }).catch(err => {
          console.warn("Admin could not mark scheduled reservation as used: ", err);
        })
      ]);
    } catch (err) {
      console.error("Update reservation error:", err);
    }
  };

  const addAnnouncement = async () => {
    if (!announcementText.trim()) return;
    setIsAddingAnnouncement(true);
    try {
      const annRef = ref(database, 'announcements');
      await push(annRef, {
        text: announcementText,
        createdAt: new Date().toISOString()
      });
      setAnnouncementText('');
    } catch (err) {
      console.error("Add announcement error:", err);
    } finally {
      setIsAddingAnnouncement(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await remove(ref(database, `announcements/${id}`));
    } catch (err) {
      console.error("Delete announcement error:", err);
    }
  };

  const confirmReset = async () => {
    try {
      await remove(ref(database, '/'));
      window.location.reload();
    } catch (err) {
      console.error("Reset error:", err);
    }
  };

  const resetData = () => {
    setShowResetDialog(true);
  };

  if (loading) return null;

  if (!user || !isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-12 sm:mt-20 p-4 sm:p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200/60 dark:border-slate-800 shadow-xl overflow-hidden shadow-brand-blue/5 dark:shadow-none transition-all"
        >
          <div className="bg-slate-950 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/85 p-8 text-slate-100">
            <div className="w-12 h-12 bg-red-500/10 dark:bg-red-500/20 rounded-xl flex items-center justify-center mb-4 border border-red-500/20">
              <Lock className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">SeatIdle Secure Office</h2>
            <p className="text-brand-green text-[10px] mt-1 font-black tracking-wider uppercase">Authorized IoT Personnel Only</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            {!isAdmin && user && (
              <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs p-3 rounded-xl border border-amber-100 dark:border-amber-900/30 font-medium mb-4">
                Logged in as {user.email}, but you don't have admin access. Please use an admin account.
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Username / Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:focus:bg-slate-800 dark:text-slate-200 transition-all"
                    placeholder="Admin or name@library.com"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:focus:bg-slate-800 dark:text-slate-200 transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end mt-1 px-1">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[10px] font-bold text-brand-blue hover:text-brand-blue/80 cursor-pointer select-none transition-colors uppercase tracking-widest"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>
            </div>

            {resetSent && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 font-medium leading-relaxed">
                Reset link dispatched successfully! Please check your email inbox.
              </div>
            )}

            {authError && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs p-3 rounded-xl border border-red-100 dark:border-red-900/30 font-medium leading-relaxed">
                {authError}
              </div>
            )}

            <button 
              disabled={isLoggingIn}
              className="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-blue/10 dark:shadow-none hover:bg-brand-blue/90 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
            >
              <LogIn className="w-4 h-4 mr-2" />
              {isLoggingIn ? 'Verifying...' : 'Access Dashboard'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest bg-white dark:bg-slate-900 px-4">
                Or Continue With
              </div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="w-full flex justify-center items-center gap-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-bold text-sm shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-5 md:p-8 space-y-6 md:space-y-8 pb-24 lg:pb-12">
      
      {/* Top Header Section with Welcome Text & Pulse Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-[28px] md:rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-0.5">
              <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-650 dark:text-red-400 text-[9px] font-black uppercase tracking-wider">
                SeatIdle Admin Control Center
              </span>
              
              {(() => {
                const isSystemOnline = status.last_heartbeat 
                  ? (now - status.last_heartbeat < 65000) 
                  : false;
                return (
                  <span className={cn(
                    "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all duration-300",
                    isSystemOnline 
                      ? "bg-brand-green/10 border-brand-green/30 text-brand-green" 
                      : "bg-red-500/10 border-red-500/30 text-red-500"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isSystemOnline ? "bg-brand-green animate-pulse" : "bg-red-500"
                    )}></span>
                    {isSystemOnline ? "System Online" : "System Offline"}
                  </span>
                );
              })()}
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
              IoT Desk Sync Settings
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">
              Manage library status feeds, register staff RFID cards, moderate live notices, and analyze usage trends.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Desktop Side Navigation Rail */}
        <aside className="hidden lg:flex flex-col gap-6 sticky top-8 lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200/60 dark:border-slate-800 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.012)] transition-all">
            <div className="flex items-center space-x-2 pb-1.5 bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-transparent">
              <Settings className="w-5 h-5 text-red-500" />
              <span className="text-[11px] font-black uppercase tracking-widest">Admin Control</span>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">Click to pivot admin views</p>
            
            <nav className="flex flex-col gap-1.5 mt-5">
              {[
                { id: 'capacity', label: 'Capacity & Bookings', icon: SlidersHorizontal },
                { id: 'staff', label: 'Personnel & Cards', icon: Users },
                { id: 'notices', label: 'Notices & Alerts', icon: Bell },
                { id: 'reports', label: 'Usage Reports', icon: BarChart3 }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                    }}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border text-left cursor-pointer",
                      isActive 
                        ? "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700/60 font-black shadow-sm" 
                        : "bg-transparent text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-300 border-transparent hover:bg-slate-100/65 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0 transition-transform duration-200", isActive ? "text-brand-blue dark:text-brand-green stroke-[2.5]" : "text-slate-400")} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content Column */}
        <div className="lg:col-span-3 space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'capacity' && (
              <motion.div 
                key="capacity"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col gap-8"
              >
                {/* Capacity Control Column */}
                <div className="w-full flex flex-col space-y-8 transition-colors">
                  <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-8 flex items-center">
                      <SlidersHorizontal className="w-5 h-5 mr-3 text-brand-green" />
                      Library Status
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Total Capacity</label>
                          <input 
                            type="number"
                            value={editCapacity}
                            onChange={(e) => setEditCapacity(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-lg font-bold text-slate-700 dark:text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Manual Occupancy</label>
                          <input 
                            type="number"
                            value={editOccupancy}
                            onChange={(e) => setEditOccupancy(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-lg font-bold text-slate-700 dark:text-slate-200"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={updateStatus}
                        disabled={isUpdatingStatus}
                        className="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-blue/10 dark:shadow-none hover:bg-brand-blue/90 transition-all flex items-center justify-center group disabled:opacity-50 cursor-pointer"
                      >
                        {isUpdatingStatus ? <Loader size="sm" light className="mr-2" /> : <Save className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" /> }
                        Update Real-time Feed
                      </button>
                      
                      <button 
                        onClick={resetData}
                        className="w-full bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-bold py-3 rounded-2xl border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all text-xs flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Reset System Defaults
                      </button>
                    </div>
                  </section>
                </div>

                {/* Reservations Table Column */}
                <div className="w-full">
                  <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                    <div className="p-8 pb-4">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-brand-green" />
                        Active Reservations
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-[600px] w-full">
                      <table className="w-full text-left min-w-[850px]">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-widest font-black">
                          <tr>
                            <th className="px-8 py-4">Student</th>
                            <th className="px-8 py-4">Booking Date</th>
                            <th className="px-8 py-4">Time Slot</th>
                            <th className="px-8 py-4">OTP</th>
                            <th className="px-8 py-4">Status</th>
                            <th className="px-8 py-4 text-right">Management</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
                          {reservations.map(res => (
                            <tr key={res.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-8 py-5 font-semibold text-slate-700 dark:text-slate-300 text-sm">{res.name}</td>
                              <td className="px-8 py-5 text-brand-blue dark:text-brand-green text-xs font-black">{res.date || 'N/A'}</td>
                              <td className="px-8 py-5 text-slate-500 dark:text-slate-500 text-xs font-medium">{res.time}</td>
                              <td className="px-8 py-5">
                                <span className="font-mono font-bold text-brand-blue dark:text-brand-green text-base tracking-widest">{res.otp}</span>
                              </td>
                              <td className="px-8 py-5">
                                {res.is_used ? (
                                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 line-through">
                                    Arrived
                                  </span>
                                ) : res.start_time !== undefined && res.end_time !== undefined ? (
                                  now >= res.start_time && now <= res.end_time ? (
                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter bg-brand-green/20 text-brand-green border border-brand-green/35 animate-pulse">
                                      Active Session
                                    </span>
                                  ) : now < res.start_time ? (
                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
                                      Upcoming
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase text-red-500 bg-red-500/10 dark:bg-red-950/25 border border-red-500/20">
                                      Expired
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter bg-brand-blue/10 text-brand-blue">
                                    Awaiting
                                  </span>
                                )}
                              </td>
                              <td className="px-8 py-5 text-right space-x-2">
                                {!res.is_used && (
                                  <button 
                                    onClick={() => markReservationUsed(res.id)}
                                    className="p-2 text-brand-blue dark:text-brand-green hover:bg-brand-blue/5 dark:hover:bg-brand-green/10 rounded-xl transition-all cursor-pointer"
                                    title="Mark as Used"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                )}
                                {confirmingReservationId === res.id ? (
                                  <div className="inline-flex items-center space-x-1 pl-2">
                                    <button 
                                      onClick={async () => {
                                        try {
                                          await Promise.all([
                                            remove(ref(database, `active_reservations/${res.id}`)).catch(err => {
                                              console.warn("Admin could not delete active reservation: ", err);
                                            }),
                                            remove(ref(database, `scheduled_reservations/${res.id}`)).catch(err => {
                                              console.warn("Admin could not delete scheduled reservation: ", err);
                                            })
                                          ]);
                                        } catch (err) {
                                          console.error("Delete reservation error:", err);
                                        } finally {
                                          setConfirmingReservationId(null);
                                        }
                                      }}
                                      className="px-2.5 py-1 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg border border-red-500/20 transition-all font-bold cursor-pointer"
                                    >
                                      Yes
                                    </button>
                                    <button 
                                      onClick={() => setConfirmingReservationId(null)}
                                      className="px-2.5 py-1 text-[10px] font-bold uppercase text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setConfirmingReservationId(res.id)}
                                    className="p-2 text-red-450 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all cursor-pointer"
                                    title="Cancel Booking"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {reservations.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-8 py-12 text-center text-slate-400 dark:text-slate-600 text-xs italic font-semibold">
                                No active student reservations found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'staff' && (
              <motion.div 
                key="staff"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col gap-8"
              >
                {/* Register Staff Section */}
                <div className="w-full flex flex-col space-y-8 transition-colors">
                  <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-6 flex items-center">
                      <Plus className="w-4 h-4 mr-2 text-brand-green" />
                      Register Staff
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Staff Name</label>
                          <input 
                            type="text"
                            placeholder="e.g., Dr. Silva"
                            value={newStaffName}
                            onChange={(e) => setNewStaffName(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">RFID Card UID (Hex)</label>
                          <input 
                            type="text"
                            placeholder="e.g., A1B2C3D4"
                            value={newStaffUid}
                            onChange={(e) => setNewStaffUid(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all font-mono font-semibold"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Designation / Role</label>
                          <input 
                            type="text"
                            placeholder="e.g., Professor"
                            value={newStaffRole}
                            onChange={(e) => setNewStaffRole(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Department</label>
                          <input 
                            type="text"
                            placeholder="e.g., Computer Science"
                            value={newStaffDept}
                            onChange={(e) => setNewStaffDept(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Contact Email</label>
                          <input 
                            type="email"
                            placeholder="e.g., silva@seatidle.edu"
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block mb-1.5 tracking-widest ml-1">Phone Number</label>
                          <input 
                            type="text"
                            placeholder="e.g., +94 77 123 4567"
                            value={newStaffPhone}
                            onChange={(e) => setNewStaffPhone(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={addStaff}
                        disabled={isAddingStaff}
                        className="w-full bg-brand-blue text-white py-3.5 rounded-2xl font-bold text-[10px] hover:bg-brand-blue/95 transition-all disabled:opacity-50 flex items-center justify-center uppercase tracking-widest cursor-pointer"
                      >
                        {isAddingStaff ? <Loader size="sm" light /> : 'Add Card'}
                      </button>
                    </div>
                  </section>
                </div>

                {/* Staff Table */}
                <div className="w-full">
                  <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full flex flex-col transition-colors">
                    <div className="p-8 pb-4">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center font-black">
                        <Users className="w-4 h-4 mr-2 text-brand-green" />
                        Personnel Management
                      </h3>
                    </div>
                    <div className="flex-1 overflow-x-auto w-full">
                      <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-widest font-black">
                          <tr>
                            <th className="px-8 py-4">Personnel</th>
                            <th className="px-8 py-4">Role & Department</th>
                            <th className="px-8 py-4">Contact Details</th>
                            <th className="px-8 py-4">Status</th>
                            <th className="px-8 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {staffList.map(staff => (
                            <tr key={staff.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-8 py-5">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-green flex items-center justify-center font-bold text-xs">
                                    {(staff.name || 'Staff').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || 'ST'}
                                  </div>
                                  <div>
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">{staff.name}</span>
                                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block">UID: {staff.id}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-5">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">{staff.role || 'Staff Member'}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 block">{staff.department || 'General'}</span>
                              </td>
                              <td className="px-8 py-5">
                                <span className="text-xs text-slate-700 dark:text-slate-300 block font-medium">{staff.email || 'staff@seatidle.edu'}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">{staff.phone || '+94 77 123 4567'}</span>
                              </td>
                              <td className="px-8 py-5">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter inline-flex items-center space-x-1.5",
                                  staff.is_present ? "bg-brand-green/10 dark:bg-brand-green/20 text-brand-green dark:text-brand-green" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500"
                                )}>
                                  {staff.is_present && (
                                    <span className="relative flex h-1.5 w-1.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-green"></span>
                                    </span>
                                  )}
                                  <span>{staff.is_present ? 'Present' : 'Away'}</span>
                                </span>
                              </td>
                              <td className="px-8 py-5 text-right flex items-center justify-end space-x-2">
                                <button 
                                  onClick={() => {
                                    setSelectedStaff(staff);
                                    setEditStaffName(staff.name || '');
                                    setEditStaffRole(staff.role || 'Staff Member');
                                    setEditStaffDept(staff.department || 'General');
                                    setEditStaffEmail(staff.email || 'staff@seatidle.edu');
                                    setEditStaffPhone(staff.phone || '+94 77 123 4567');
                                    setIsEditingProfile(false);
                                  }}
                                  className="px-3 py-1.5 text-[10px] font-black uppercase text-brand-blue hover:bg-brand-blue/5 dark:text-brand-green dark:hover:bg-brand-green/10 rounded-xl border border-brand-blue/10 dark:border-brand-green/10 transition-all font-bold cursor-pointer"
                                >
                                  Inspect
                                </button>
                                <button 
                                  onClick={() => toggleStaffPresence(staff.id, staff.is_present)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer",
                                    staff.is_present ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10" : "text-brand-green hover:bg-brand-green/5 dark:hover:bg-brand-green/10"
                                  )}
                                >
                                  {staff.is_present ? 'Set Away' : 'Set Present'}
                                </button>
                                {confirmingStaffId === staff.id ? (
                                  <div className="flex items-center space-x-1 pl-2">
                                    <button 
                                      onClick={async () => {
                                        try {
                                          await remove(ref(database, `staff_presence/${staff.id}`));
                                        } catch (err) {
                                          console.error("Delete staff error:", err);
                                        } finally {
                                          setConfirmingStaffId(null);
                                        }
                                      }}
                                      className="px-2.5 py-1 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg border border-red-500/20 transition-all font-bold cursor-pointer"
                                    >
                                      Yes
                                    </button>
                                    <button 
                                      onClick={() => setConfirmingStaffId(null)}
                                      className="px-2.5 py-1 text-[10px] font-bold uppercase text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setConfirmingStaffId(staff.id)}
                                    className="p-2 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                                    title="Remove Staff"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {staffList.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-8 py-12 text-center text-slate-400 dark:text-slate-600 text-xs italic font-semibold">
                                No staff members registered.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'notices' && (
              <motion.div 
                key="notices"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="grid grid-cols-1 xl:grid-cols-12 gap-8"
              >
                {/* Post Announcement Section */}
                <div className="xl:col-span-5 flex flex-col space-y-8">
                  <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-6 flex items-center">
                      <Mail className="w-4 h-4 mr-2 text-brand-green" />
                      Post Announcement
                    </h3>
                    <div className="space-y-4">
                      <textarea 
                        rows={4}
                        placeholder="Type important notice for students..."
                        value={announcementText}
                        onChange={(e) => setAnnouncementText(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all resize-none"
                      />
                      <button 
                        onClick={addAnnouncement}
                        disabled={isAddingAnnouncement}
                        className="w-full bg-brand-blue/5 dark:bg-brand-blue/30 text-brand-blue dark:text-brand-green py-3 rounded-2xl font-black text-xs hover:bg-brand-blue hover:text-white transition-all disabled:opacity-50 flex items-center justify-center uppercase tracking-widest cursor-pointer"
                      >
                        {isAddingAnnouncement ? <Loader size="sm" /> : 'POST NOTICE'}
                      </button>
                    </div>

                    {announcements.length > 0 && (
                      <div className="mt-8 space-y-4">
                        <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Active Notices</p>
                        <div className="space-y-3">
                          {announcements.map(ann => (
                            <div key={ann.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 relative group">
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pr-6">{ann.text}</p>
                              <button 
                                onClick={() => deleteAnnouncement(ann.id)}
                                className="absolute top-2 right-2 p-1 text-slate-350 hover:text-red-500 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                {/* Notices Live Preview Simulator */}
                <div className="xl:col-span-7">
                  <section className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8 shadow-sm h-full flex flex-col justify-between transition-colors">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between pb-2">
                        <div className="flex items-center space-x-2.5">
                          <Bell className="w-5 h-5 text-amber-500 animate-bounce" />
                          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Notice Board Preview</h3>
                        </div>
                        <span className="px-2.5 py-1 text-[9px] bg-amber-500/10 text-amber-500 font-extrabold rounded-lg uppercase tracking-wide">
                          Live Feed
                        </span>
                      </div>
                      
                      <p className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-relaxed">
                        Notice posts appear instantly in the student portal notice hub, delivering critical, real-time library updates or special notifications directly to on-screen cards.
                      </p>

                      <div className="border border-slate-200 dark:border-slate-800/80 rounded-2xl bg-slate-50 dark:bg-slate-950 p-6 space-y-4 shadow-inner">
                        <div className="flex items-center space-x-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green"></span>
                          </span>
                          <span className="text-[10px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-widest">Student Portal preview</span>
                        </div>
                        
                        {announcements.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 dark:text-slate-600 italic text-xs">
                            No notices are currently published. Post a new notice on the left to display it to students.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {announcements.slice(0, 3).map((ann, idx) => (
                              <div key={ann.id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 flex items-start space-x-3.5 shadow-sm">
                                <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed break-words">
                                    {ann.text}
                                  </p>
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block mt-2 font-bold uppercase tracking-wider">
                                    PUBLISHED • ACCESSIBLE
                                  </span>
                                </div>
                              </div>
                            ))}
                            {announcements.length > 3 && (
                              <p className="text-center text-[10px] text-brand-blue dark:text-brand-green font-bold uppercase tracking-wider pt-2">
                                + {announcements.length - 3} more notice(s) on board
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 p-5 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex items-start space-x-3.5">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Notice Rules & Guidelines</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Please keep notices clear, precise and respectful. Outdated announcements should be removed regularly to avoid cluttering the student dashboard view.
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-8"
              >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Peak Occupancy</p>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-black text-slate-800 dark:text-white">
                    {Math.max(...historyData.map(h => h.occupancy), 0)}
                  </p>
                  <TrendingUp className="w-8 h-8 text-brand-green opacity-20" />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Avg. Occupancy</p>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-black text-slate-800 dark:text-white">
                    {historyData.length > 0 
                      ? Math.round(historyData.reduce((acc, curr) => acc + curr.occupancy, 0) / historyData.length)
                      : 0}
                  </p>
                  <BarChart3 className="w-8 h-8 text-brand-blue opacity-20" />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Total Samples</p>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-black text-slate-800 dark:text-white">{historyData.length}</p>
                  <PieChart className="w-8 h-8 text-brand-blue opacity-20" />
                </div>
              </div>
            </div>

            <section className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 p-10 shadow-sm overflow-hidden min-h-[500px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-12">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Occupancy Trends</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Real-time usage analysis for the last 24 recorded points</p>
                </div>
                <div className="mt-4 md:mt-0 flex gap-2">
                  <span className="px-3 py-1.5 bg-brand-blue/10 text-brand-blue text-[10px] font-black uppercase tracking-widest rounded-full border border-brand-blue/20">Daily View</span>
                  <span className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-slate-100 dark:border-slate-800">Weekly</span>
                </div>
              </div>

              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="colorOcc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2D60FF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2D60FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="timestamp" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                      dx={-10}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        backgroundColor: '#FFF'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="occupancy" 
                      stroke="#2D60FF" 
                      strokeWidth={4} 
                      fillOpacity={1} 
                      fill="url(#colorOcc)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

        </div> {/* Content Column end */}
      </div> {/* Grid end */}

      {/* Dynamic Connected Bottom Navigation for Mobile Admin */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] px-4 pt-2.5 pb-5 flex items-center justify-around select-none">
        {[
          { id: 'capacity', label: 'Capacity', icon: SlidersHorizontal },
          { id: 'staff', label: 'Staff', icon: Users },
          { id: 'notices', label: 'Notices', icon: Bell },
          { id: 'reports', label: 'Reports', icon: BarChart3 },
          { id: 'exit', label: 'Exit', icon: LogOut, isLink: true }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === 'exit' ? false : activeTab === tab.id;
          
          if (tab.isLink) {
            return (
              <Link
                key={tab.id}
                to="/"
                className="relative py-1 flex flex-col items-center justify-center active:scale-95 transition-all text-center flex-1 h-12"
              >
                <Icon className="w-5 h-5 text-red-500/85" />
                <span className="text-[9px] font-black uppercase tracking-wider mt-1 text-slate-400 dark:text-slate-500 font-bold">
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as any);
              }}
              className="relative py-1 flex flex-col items-center justify-center active:scale-95 transition-all text-center flex-1 h-12 cursor-pointer"
            >
              {isActive && (
                <motion.div 
                  layoutId="activeAdminTabPill" 
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
            </button>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showResetDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetDialog(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8 md:p-10 max-w-md w-full shadow-2xl"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-950/30 rounded-3xl flex items-center justify-center mb-8 mx-auto rotate-12">
                <AlertTriangle className="w-10 h-10 text-red-500 -rotate-12" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center mb-4 tracking-tight">Factory Reset System?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-10 leading-relaxed font-medium px-4">
                This will permanently delete all staff records, student reservations, and notices. <span className="text-red-500 font-bold">This operation cannot be reversed.</span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowResetDialog(false)}
                  className="px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-[0.98]"
                >
                  Keep Data
                </button>
                <button
                  onClick={confirmReset}
                  className="px-6 py-4 rounded-2xl bg-red-600 text-white font-bold text-sm shadow-xl shadow-red-200 dark:shadow-none hover:bg-red-700 transition-all active:scale-[0.98]"
                >
                  Confirm Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {selectedStaff && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStaff(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-6 md:p-8 max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors animate-in fade-in zoom-in duration-200"
            >
              <button 
                onClick={() => setSelectedStaff(null)}
                className="absolute top-6 right-6 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-all border border-slate-100 dark:border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start space-x-6 mb-6">
                <div className="w-20 h-20 bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-green rounded-3xl flex items-center justify-center text-3xl font-black shrink-0 relative">
                  {(selectedStaff.name || 'Staff').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || 'ST'}
                  <span className={cn(
                    "absolute bottom-0 right-0 w-5 h-5 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-lg",
                    selectedStaff.is_present ? "bg-brand-green" : "bg-slate-400"
                  )}></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">RFID CARD</span>
                    <span className="text-xs font-semibold text-slate-500 font-mono">ID: {selectedStaff.id}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate">{selectedStaff.name}</h3>
                  <p className="text-xs text-brand-blue dark:text-brand-green font-bold uppercase tracking-wider mt-0.5">
                    {selectedStaff.role || 'Staff Member'} {selectedStaff.department ? ` • ${selectedStaff.department}` : ''}
                  </p>
                </div>
              </div>

              {/* Profile Details & Real-Time Attendance Monitoring */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                {!isEditingProfile ? (
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Personnel Profile Info</h4>
                      <button 
                        onClick={() => {
                          setEditStaffName(selectedStaff.name || '');
                          setEditStaffRole(selectedStaff.role || 'Staff Member');
                          setEditStaffDept(selectedStaff.department || 'General');
                          setEditStaffEmail(selectedStaff.email || 'staff@seatidle.edu');
                          setEditStaffPhone(selectedStaff.phone || '+94 77 123 4567');
                          setIsEditingProfile(true);
                        }}
                        className="text-brand-blue dark:text-brand-green font-bold text-xs uppercase tracking-wider hover:opacity-85"
                      >
                        Modify Profile
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Title / Role</span>
                        <span className="text-slate-700 dark:text-slate-200 font-semibold">{selectedStaff.role || 'Staff Member'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Department</span>
                        <span className="text-slate-700 dark:text-slate-200 font-semibold">{selectedStaff.department || 'General'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Contact Email</span>
                        <span className="text-slate-700 dark:text-slate-200 font-semibold break-all">{selectedStaff.email || 'staff@seatidle.edu'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Phone Contact</span>
                        <span className="text-slate-700 dark:text-slate-200 font-semibold">{selectedStaff.phone || '+94 77 123 4567'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Registration Date</span>
                        <span className="text-slate-700 dark:text-slate-200 font-mono">
                          {selectedStaff.joined_date 
                            ? new Date(selectedStaff.joined_date).toLocaleDateString('en-LK', { dateStyle: 'medium', timeZone: 'Asia/Colombo' }) 
                            : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Last Interaction</span>
                        <span className="text-slate-700 dark:text-slate-200 font-mono">
                          {selectedStaff.last_updated 
                            ? new Date(selectedStaff.last_updated).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' }) 
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-widest text-brand-blue dark:text-brand-green">Modify Profile Fields</h4>
                      <button 
                        onClick={() => setIsEditingProfile(false)}
                        className="text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wider hover:text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Full Name</label>
                        <input 
                          type="text" 
                          value={editStaffName} 
                          onChange={(e) => setEditStaffName(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Designation</label>
                          <input 
                            type="text" 
                            value={editStaffRole} 
                            onChange={(e) => setEditStaffRole(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Department</label>
                          <input 
                            type="text" 
                            value={editStaffDept} 
                            onChange={(e) => setEditStaffDept(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Contact Email</label>
                          <input 
                            type="email" 
                            value={editStaffEmail} 
                            onChange={(e) => setEditStaffEmail(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Phone</label>
                          <input 
                            type="text" 
                            value={editStaffPhone} 
                            onChange={(e) => setEditStaffPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 transition-all font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => updateStaffProfile(selectedStaff.id)}
                      className="w-full bg-brand-blue text-white py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-widest hover:bg-brand-blue/95 flex items-center justify-center mt-2"
                    >
                      Save Configuration
                    </button>
                  </div>
                )}

                {/* Manual Check-In/Away Toggle Logs Injector */}
                <div className="flex items-center justify-between p-4 bg-blue-50/50 dark:bg-slate-800/10 border border-brand-blue/10 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h5 className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Attendance Status Tools</h5>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Toggle logs or override attendance online</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => addManualLog(selectedStaff.id, 'IN', 'ADMIN_MANUAL_IN')}
                      disabled={selectedStaff.is_present}
                      className="px-3.5 py-1.5 bg-brand-green/20 text-brand-green hover:bg-brand-green/30 disabled:opacity-40 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      Manual In
                    </button>
                    <button
                      onClick={() => addManualLog(selectedStaff.id, 'OUT', 'ADMIN_MANUAL_OUT')}
                      disabled={!selectedStaff.is_present}
                      className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 disabled:opacity-40 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      Manual Out
                    </button>
                  </div>
                </div>

                {/* Historical Scan Timeline & Log History */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center font-bold">
                      <Clock className="w-3.5 h-3.5 mr-1.5 text-brand-green" />
                      Attendance Logs & Scan Transactions
                    </h4>
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                      Total: {selectedStaff.logs ? Object.keys(selectedStaff.logs).length : 0} logs
                    </span>
                  </div>

                  <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[220px] overflow-y-auto bg-slate-50/30 dark:bg-slate-900/40">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedStaff.logs ? (
                        Object.entries(selectedStaff.logs)
                          .map(([logId, val]: [string, any]) => ({ id: logId, ...val }))
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map(log => (
                            <div key={log.id} className="flex items-center justify-between p-3 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all">
                              <div className="flex items-center space-x-3 text-xs">
                                <span className={cn(
                                  "w-12 py-1 text-[8px] font-black tracking-widest text-center rounded-lg uppercase inline-block",
                                  log.status === 'IN' ? "bg-brand-green/10 text-brand-green" : "bg-red-500/10 text-red-500"
                                )}>
                                  {log.status === 'IN' ? 'CHECK-IN' : 'CHECK-OUT'}
                                </span>
                                <div>
                                  <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 block">
                                    {new Date(log.timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' })}
                                  </span>
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block">
                                    {new Date(log.timestamp).toLocaleDateString('en-LK', { dateStyle: 'medium', timeZone: 'Asia/Colombo' })}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg tracking-wider">
                                {log.method ? log.method.replace(/_/g, ' ') : 'RFID SENSOR'}
                              </span>
                            </div>
                          ))
                      ) : (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-600 text-xs italic">
                          No scan transactions recorded yet. Log scans will automatically register here.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button 
                  onClick={() => setSelectedStaff(null)}
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                >
                  Close Inspection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
