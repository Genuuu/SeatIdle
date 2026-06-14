import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth, database, ref, onValue, set, push, remove, update, get } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Users, Calendar, Plus, Trash2, LogIn, Lock, LogOut, Mail, Save, AlertTriangle, AlertCircle, TrendingUp, BarChart3, PieChart, X, Clock, Phone, SlidersHorizontal, Bell, Download, Info, User, Monitor, Search, ArrowLeft, ArrowRight, Check } from 'lucide-react';
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
  portal_logins?: Record<string, {
    timestamp: string;
    email: string;
    userAgent: string;
    platform: string;
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
  const [reportedIssuesList, setReportedIssuesList] = useState<any[]>([]);

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
  const [inspectorTab, setInspectorTab] = useState<'profile' | 'presence' | 'analytics'>('profile');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState('');
  const [editStaffDept, setEditStaffDept] = useState('');
  const [editStaffEmail, setEditStaffEmail] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');

  const [announcementText, setAnnouncementText] = useState('');
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [announcementSuccess, setAnnouncementSuccess] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'capacity' | 'staff' | 'notices' | 'reports' | 'issues'>('capacity');
  const [confirmingStaffId, setConfirmingStaffId] = useState<string | null>(null);
  const [confirmingReservationId, setConfirmingReservationId] = useState<string | null>(null);
  const [confirmingIssueId, setConfirmingIssueId] = useState<string | null>(null);

  // Student Issues filter states
  const [issuesSearch, setIssuesSearch] = useState('');
  const [issuesStatusFilter, setIssuesStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [issuesUrgencyFilter, setIssuesUrgencyFilter] = useState<'all' | 'low' | 'medium' | 'critical'>('all');

  // Staff Sub-tab Attendance Register states
  const [staffSubTab, setStaffSubTab] = useState<'list' | 'register'>('list');
  const [registerSearch, setRegisterSearch] = useState('');

  const getColomboDateString = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(d);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      if (year && month && day) {
        const mm = month.padStart(2, '0');
        const dd = day.padStart(2, '0');
        return `${year}-${mm}-${dd}`;
      }
    } catch (e) {
      console.error("Colombo timezone conversion error:", e);
    }
    try {
      return new Date(isoString).toISOString().split('T')[0];
    } catch (err) {
      return '';
    }
  };

  const [selectedFilterDate, setSelectedFilterDate] = useState(() => {
    try {
      const colomboDay = getColomboDateString(new Date().toISOString());
      if (colomboDay && colomboDay.length === 10) {
        return colomboDay;
      }
    } catch (e) {}
    return new Date().toISOString().split('T')[0];
  });

  const formatDuration = (ms: number) => {
    if (!ms || ms < 0) return '0 min';
    const mins = Math.floor(ms / (1000 * 60));
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  };

  // Loading States
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [isAddingAnnouncement, setIsAddingAnnouncement] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [rawHistoryData, setRawHistoryData] = useState<any[]>([]);

  // Analytics for selected staff
  const { totalShiftCount, totalHours, avgHoursPerShift, dayData, portalLoginsEntries, totalPortalLogins, parsedLogEntries, handleExportCSV, parseUserAgent } = (() => {
    if (!selectedStaff) {
      return {
        totalShiftCount: 0,
        totalHours: 0,
        avgHoursPerShift: 0,
        dayData: [],
        portalLoginsEntries: [],
        totalPortalLogins: 0,
        parsedLogEntries: [],
        handleExportCSV: () => {},
        parseUserAgent: (ua: string) => ({ browser: 'Unknown', os: 'Device' })
      };
    }

    const parseUserAgent = (ua: string) => {
      if (!ua) return { browser: 'Unknown', os: 'Device' };
      let browser = 'Other Browser';
      let os = 'Unknown Device';
      
      const lowercaseUa = ua.toLowerCase();
      if (lowercaseUa.includes('chrome')) browser = 'Google Chrome';
      else if (lowercaseUa.includes('safari') && !lowercaseUa.includes('chrome')) browser = 'Apple Safari';
      else if (lowercaseUa.includes('firefox')) browser = 'Mozilla Firefox';
      else if (lowercaseUa.includes('edge')) browser = 'Microsoft Edge';
      
      if (lowercaseUa.includes('windows')) os = 'Windows PC';
      else if (lowercaseUa.includes('macintosh') || lowercaseUa.includes('mac os')) os = 'macOS';
      else if (lowercaseUa.includes('iphone') || lowercaseUa.includes('ipad')) os = 'iOS Device';
      else if (lowercaseUa.includes('android')) os = 'Android Device';
      else if (lowercaseUa.includes('linux')) os = 'Linux OS';
      
      return { browser, os };
    };

    const parsedLogEntries = selectedStaff.logs 
      ? Object.entries(selectedStaff.logs)
          .map(([k, v]: [string, any]) => ({ id: k, ...v }))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      : [];

    const computedShifts: Array<{ checkIn: Date; checkOut: Date | null; durationMs: number }> = [];
    let currentIn: any = null;

    parsedLogEntries.forEach(log => {
      if (log.status === 'IN') {
        currentIn = log;
      } else if (log.status === 'OUT' && currentIn) {
        const start = new Date(currentIn.timestamp);
        const end = new Date(log.timestamp);
        computedShifts.push({
          checkIn: start,
          checkOut: end,
          durationMs: end.getTime() - start.getTime()
        });
        currentIn = null;
      }
    });
    if (selectedStaff.is_present && currentIn) {
      computedShifts.push({
        checkIn: new Date(currentIn.timestamp),
        checkOut: null,
        durationMs: Date.now() - new Date(currentIn.timestamp).getTime()
      });
    }

    const totalShiftCount = computedShifts.length;
    const totalDurationMs = computedShifts.reduce((sum, s) => sum + s.durationMs, 0);
    const totalHours = Number((totalDurationMs / (1000 * 60 * 60)).toFixed(1));
    const avgHoursPerShift = totalShiftCount > 0 ? Number((totalHours / totalShiftCount).toFixed(1)) : 0;

    const dayAbbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayData = dayAbbreviations.map((abbr, idx) => ({
      name: abbr,
      Hours: 0,
      Shifts: 0
    }));

    computedShifts.forEach(s => {
      const dayIdx = s.checkIn.getDay();
      const hrs = s.durationMs / (1000 * 60 * 60);
      dayData[dayIdx].Hours += Number(hrs.toFixed(1));
      dayData[dayIdx].Shifts += 1;
    });

    const portalLoginsEntries = selectedStaff.portal_logins
      ? Object.entries(selectedStaff.portal_logins)
          .map(([k, v]: [string, any]) => ({ id: k, ...v }))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : [];

    const totalPortalLogins = portalLoginsEntries.length;

    const handleExportCSV = () => {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "STAFF INDIVIDUAL ATTENDANCE & LOGS REPORT\n";
      csvContent += `Name,${selectedStaff.name}\n`;
      csvContent += `RFID Card UID,${selectedStaff.id}\n`;
      csvContent += `Role,${selectedStaff.role || 'Staff Member'}\n`;
      csvContent += `Department,${selectedStaff.department || 'General'}\n`;
      csvContent += `Email,${selectedStaff.email || 'N/A'}\n\n`;
      
      csvContent += "--- METRICS SECTION ---\n";
      csvContent += `Total Completed Shifts,${totalShiftCount}\n`;
      csvContent += `Total Hours Swiped,${totalHours} hours\n`;
      csvContent += `Average Hours Per Shift,${avgHoursPerShift} hours\n`;
      csvContent += `Total Portal Login Sessions,${totalPortalLogins}\n\n`;
      
      csvContent += "--- DETAILED RFID SWIPE LOGS ---\n";
      csvContent += "Date,Time,Event Type,Method\n";
      
      const sortedSwipeForReport = [...parsedLogEntries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      sortedSwipeForReport.forEach(log => {
        const d = new Date(log.timestamp);
        const dateFormatted = d.toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' }).replace(/,/g, '');
        const timeFormatted = d.toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' }).replace(/,/g, '');
        csvContent += `"${dateFormatted}","${timeFormatted}","${log.status === 'IN' ? 'CHECK-IN' : 'CHECK-OUT'}","${(log.method || 'RFID_SENSOR').replace(/_/g, ' ')}"\n`;
      });
      
      csvContent += "\n--- DETAILED WEB PORTAL LOGINS ---\n";
      csvContent += "Date,Time,Email,Browser,Platform\n";
      
      portalLoginsEntries.forEach(log => {
        const d = new Date(log.timestamp);
        const dateFormatted = d.toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' }).replace(/,/g, '');
        const timeFormatted = d.toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' }).replace(/,/g, '');
        const { browser, os } = parseUserAgent(log.userAgent || '');
        csvContent += `"${dateFormatted}","${timeFormatted}","${log.email || 'N/A'}","${browser}","${os}"\n`;
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `attendance_report_${selectedStaff.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return {
      totalShiftCount,
      totalHours,
      avgHoursPerShift,
      dayData,
      portalLoginsEntries,
      totalPortalLogins,
      parsedLogEntries,
      handleExportCSV,
      parseUserAgent
    };
  })();

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
        
        // Set both raw and sliced trend data
        setRawHistoryData(list);
        setHistoryData(list.slice(-24));
      } else {
        setRawHistoryData([]);
        setHistoryData([]);
      }
    });

    // 6. Student Issues
    const issuesRef = ref(database, 'reported_issues');
    const unsubscribeIssues = onValue(issuesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setReportedIssuesList(list);
      } else {
        setReportedIssuesList([]);
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeStaff();
      unsubscribeActiveRes();
      unsubscribeScheduledRes();
      unsubscribeAnn();
      unsubscribeHistory();
      unsubscribeIssues();
    };
  }, [user, isAdmin]);

  // History Logger logic
  useEffect(() => {
    if (!isAdmin || status.occupancy === undefined || status.occupancy === null) return;
    
    // Auto-log history whenever occupancy changes, or every 30 mins as a fallback
    const lastLogOcc = localStorage.getItem('last_logged_occupancy_val');
    const lastLogTime = localStorage.getItem('last_history_log');
    const now = Date.now();
    
    const currentOcc = status.occupancy;
    const isDifferent = lastLogOcc === null || parseInt(lastLogOcc) !== currentOcc;
    const isStale = !lastLogTime || (now - parseInt(lastLogTime)) > 1000 * 60 * 30;
    
    if (isDifferent || isStale) {
      const historyRef = ref(database, 'occupancy_history');
      push(historyRef, {
        timestamp: new Date().toISOString(),
        occupancy: currentOcc
      }).then(() => {
        localStorage.setItem('last_logged_occupancy_val', currentOcc.toString());
        localStorage.setItem('last_history_log', now.toString());
      }).catch(err => console.error("History logging error:", err));
    }
  }, [status.occupancy, isAdmin]);

  // Staff Portal Login Tracker inside Admin Panel
  useEffect(() => {
    if (user && user.email && staffList.length > 0) {
      const matchingStaff = staffList.find(s => s.email?.toLowerCase() === user.email?.toLowerCase());
      if (matchingStaff) {
        const sessionKey = `logged_staff_${matchingStaff.id}`;
        const parsedLastLogin = sessionStorage.getItem(sessionKey);
        if (!parsedLastLogin) {
          const timestamp = new Date().toISOString();
          const browser = navigator.userAgent;
          const portalLoginsRef = ref(database, `staff_presence/${matchingStaff.id}/portal_logins`);
          push(portalLoginsRef, {
            timestamp,
            email: user.email,
            userAgent: browser,
            platform: navigator.platform || 'Unknown'
          }).then(() => {
            sessionStorage.setItem(sessionKey, timestamp);
            console.log("Recorded staff admin portal login for:", matchingStaff.name);
          }).catch(err => {
            console.error("Failed to log admin portal login:", err);
          });
        }
      }
    }
  }, [user, staffList]);

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
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedStaff)) {
        setSelectedStaff(updated);
      }
    }
  }, [staffList, selectedStaff]);

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
    setAnnouncementError(null);
    setAnnouncementSuccess(false);
    try {
      const annRef = ref(database, 'announcements');
      await push(annRef, {
        text: announcementText,
        createdAt: new Date().toISOString()
      });
      setAnnouncementText('');
      setAnnouncementSuccess(true);
      setTimeout(() => {
        setAnnouncementSuccess(false);
      }, 3000);
    } catch (err: any) {
      console.error("Add announcement error:", err);
      let errMsg = err.message || String(err);
      try {
        const parsedErr = JSON.parse(errMsg);
        if (parsedErr && parsedErr.error) {
          errMsg = parsedErr.error;
        }
      } catch (_) {}
      setAnnouncementError(errMsg);
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

  // Analytics & Historical Calculations
  const peakOccupancyAllTime = rawHistoryData.length > 0 
    ? Math.max(...rawHistoryData.map(h => h.occupancy)) 
    : 0;

  const averageOccupancyAllTime = rawHistoryData.length > 0
    ? Math.round(rawHistoryData.reduce((acc, curr) => acc + curr.occupancy, 0) / rawHistoryData.length)
    : 0;

  // Calculate Hourly Distribution of occupancy over all-time history
  const hourlyOccupancyDistribution = (() => {
    const hourlyDataMap: Record<number, { total: number; count: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyDataMap[i] = { total: 0, count: 0 };
    }

    rawHistoryData.forEach(item => {
      if (!item.fullDate) return;
      const date = new Date(item.fullDate);
      
      let hourStr = '0';
      try {
        hourStr = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Colombo',
          hour: 'numeric',
          hour12: false
        }).format(date);
      } catch (err) {
        hourStr = date.getHours().toString();
      }
      const hour = (parseInt(hourStr) % 24) || 0;
      
      hourlyDataMap[hour].total += item.occupancy;
      hourlyDataMap[hour].count += 1;
    });

    return Object.entries(hourlyDataMap).map(([hStr, data]) => {
      const h = parseInt(hStr);
      const avg = data.count > 0 ? Math.round(data.total / data.count) : 0;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return {
        hourNumber: h,
        hourLabel: `${displayHour} ${ampm}`,
        occupancy: avg,
        samples: data.count
      };
    }).filter(item => item.samples > 0 || (item.hourNumber >= 8 && item.hourNumber <= 21)); // Show standard library operational hours
  })();

  // Predict peak time slot
  const busiestPredictionObj = hourlyOccupancyDistribution.reduce((prev, current) => {
    return (current.occupancy > prev.occupancy) ? current : prev;
  }, { hourLabel: 'N/A', occupancy: 0, hourNumber: 0 });

  const predictedPeakHour = busiestPredictionObj.occupancy > 0 ? busiestPredictionObj.hourLabel : 'N/A';

  // Export historical dataset as CSV file download
  const downloadHistoricalCSV = () => {
    if (rawHistoryData.length === 0) {
      alert("No historical occupancy logs found to export yet.");
      return;
    }
    const headers = ['Date', 'Time', 'Occupancy (Students)'];
    const csvContent = [
      headers.join(','),
      ...rawHistoryData.map(item => [
        `"${new Date(item.fullDate).toLocaleDateString('en-LK')}"`,
        `"${new Date(item.fullDate).toLocaleTimeString('en-LK')}"`,
        item.occupancy
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `seatidle_occupancy_report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
                { id: 'reports', label: 'Usage Reports', icon: BarChart3 },
                { id: 'issues', label: 'Student Issues', icon: AlertTriangle }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const pendingIssuesCount = reportedIssuesList.filter(iss => iss.status === 'pending').length;
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
                    {tab.id === 'issues' && pendingIssuesCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white rounded-full text-[9px] px-2 py-0.5 font-bold tracking-normal leading-normal">
                        {pendingIssuesCount}
                      </span>
                    )}
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
                className="flex flex-col gap-6"
              >
                {/* Staff Control Sub-tabs */}
                <div className="flex bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 self-start shrink-0">
                  <button
                    type="button"
                    onClick={() => setStaffSubTab('list')}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                      staffSubTab === 'list'
                        ? "bg-white dark:bg-slate-900 text-slate-850 dark:text-white shadow-sm border border-slate-100 dark:border-slate-800 font-bold"
                        : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-bold"
                    )}
                  >
                    Roster & Cards Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffSubTab('register')}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center space-x-2",
                      staffSubTab === 'register'
                        ? "bg-white dark:bg-slate-900 text-slate-850 dark:text-white shadow-sm border border-slate-100 dark:border-slate-800 font-bold"
                        : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-bold"
                    )}
                  >
                    <Calendar className="w-3.5 h-3.5 text-brand-green" />
                    <span>Daily Attendance Register</span>
                  </button>
                </div>

                {/* Sub-tab Views */}
                {staffSubTab === 'register' ? (
                  <div className="space-y-6">
                    {/* Date Navigation & Actions Header */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-brand-green/10 text-brand-green rounded-2xl">
                          <Calendar className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 tracking-widest">Active Attendance Register</h4>
                          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">
                            {new Date(selectedFilterDate).toLocaleDateString('en-LK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
                          </h2>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Day increment/decrement controls */}
                        <div className="flex items-center bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date(selectedFilterDate);
                              d.setDate(d.getDate() - 1);
                              setSelectedFilterDate(d.toISOString().split('T')[0]);
                            }}
                            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 rounded-lg transition-all cursor-pointer"
                            title="Previous Day"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          
                          <input
                            type="date"
                            value={selectedFilterDate}
                            onChange={(e) => setSelectedFilterDate(e.target.value)}
                            className="bg-transparent text-xs font-bold px-2 focus:outline-none dark:text-slate-200 cursor-pointer text-center"
                          />

                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date(selectedFilterDate);
                              d.setDate(d.getDate() + 1);
                              setSelectedFilterDate(d.toISOString().split('T')[0]);
                            }}
                            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900 rounded-lg transition-all cursor-pointer"
                            title="Next Day"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Reset to Today Button */}
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const colomboDate = getColomboDateString(new Date().toISOString());
                              setSelectedFilterDate(colomboDate);
                            } catch (e) {
                              setSelectedFilterDate(new Date().toISOString().split('T')[0]);
                            }
                          }}
                          className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300 transition-all cursor-pointer"
                        >
                          Today
                        </button>

                        {/* Export Daily Sheet button */}
                        <button
                          type="button"
                          onClick={() => {
                            // Compile and download CSV
                            const headers = ['Staff Name', 'Card UID', 'Role', 'Department', 'Email', 'First Swipe (In)', 'Last Swipe (Out)', 'Total Hours Today', 'Status'];
                            
                            const rows = staffList.map(staff => {
                              const dateLogs = staff.logs 
                                ? Object.entries(staff.logs)
                                    .map(([id, val]: [string, any]) => ({ id, ...val }))
                                    .filter(log => getColomboDateString(log.timestamp) === selectedFilterDate)
                                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                : [];
                              
                              const inLogs = dateLogs.filter(l => l.status === 'IN');
                              const outLogs = dateLogs.filter(l => l.status === 'OUT');
                              
                              const arrival = inLogs.length > 0 
                                ? new Date(inLogs[0].timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' }) 
                                : 'N/A';
                                
                              const departure = outLogs.length > 0 
                                ? new Date(outLogs[outLogs.length - 1].timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' }) 
                                : 'N/A';
                                
                              // Calculate work duration
                              let totalMs = 0;
                              let activeInTime: number | null = null;
                              for (const log of dateLogs) {
                                if (log.status === 'IN') {
                                  if (activeInTime === null) {
                                    activeInTime = new Date(log.timestamp).getTime();
                                  }
                                } else if (log.status === 'OUT') {
                                  if (activeInTime !== null) {
                                    totalMs += new Date(log.timestamp).getTime() - activeInTime;
                                    activeInTime = null;
                                  }
                                }
                              }
                              const todayStr = getColomboDateString(new Date().toISOString());
                              if (activeInTime !== null) {
                                if (selectedFilterDate === todayStr) {
                                  totalMs += Math.max(0, Date.now() - activeInTime);
                                }
                              } else if (selectedFilterDate === todayStr && staff.is_present && dateLogs.length === 0) {
                                const allLogs = staff.logs 
                                  ? Object.entries(staff.logs)
                                      .map(([id, val]: [string, any]) => ({ id, ...val }))
                                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                  : [];
                                const globalInLogs = allLogs.filter(l => l.status === 'IN');
                                if (globalInLogs.length > 0) {
                                  const lastInTime = new Date(globalInLogs[globalInLogs.length - 1].timestamp).getTime();
                                  totalMs += Math.max(0, Date.now() - lastInTime);
                                }
                              }
                              const hrs = (totalMs / (1000 * 60 * 60)).toFixed(2);
                              
                              let stat = 'Absent';
                              if (dateLogs.length > 0) {
                                stat = dateLogs[dateLogs.length - 1].status === 'IN' ? 'Present Now' : 'Completed Shift';
                              } else if (selectedFilterDate === todayStr && staff.is_present) {
                                stat = 'Present Now';
                              }
                              
                              return [
                                staff.name || 'Unnamed',
                                staff.id,
                                staff.role || 'Staff Member',
                                staff.department || 'General',
                                staff.email || 'N/A',
                                arrival,
                                departure,
                                hrs,
                                stat
                              ];
                            });
                            
                            const csvContent = [headers, ...rows]
                              .map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
                              .join("\n");
                              
                            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.setAttribute("href", url);
                            link.setAttribute("download", `staff_attendance_register_${selectedFilterDate}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="flex items-center space-x-1.5 px-4 py-2.5 bg-brand-blue dark:bg-brand-green text-white dark:text-slate-950 hover:opacity-90 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-bold shadow-sm"
                        >
                          <Download className="w-4 h-4" />
                          <span>Export Register</span>
                        </button>
                      </div>
                    </div>

                    {/* Stats Dashboard for selected register date */}
                    {(() => {
                      let activeCount = 0;
                      let presentCount = 0;
                      let totalLoggedMs = 0;
                      const todayStr = getColomboDateString(new Date().toISOString());
                      const isToday = selectedFilterDate === todayStr;

                      staffList.forEach(staff => {
                        const dateLogs = staff.logs 
                          ? Object.entries(staff.logs)
                              .map(([id, val]: [string, any]) => ({ id, ...val }))
                              .filter(log => getColomboDateString(log.timestamp) === selectedFilterDate)
                          : [];

                        if (dateLogs.length > 0) {
                          activeCount += 1;
                          const lastLog = dateLogs.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[dateLogs.length - 1];
                          if (lastLog.status === 'IN') {
                            presentCount += 1;
                          }
                        } else if (isToday && staff.is_present) {
                          activeCount += 1;
                          presentCount += 1;
                        }

                        // Calculate total hours
                        const sortedLogs = staff.logs 
                          ? Object.entries(staff.logs)
                              .map(([id, val]: [string, any]) => ({ id, ...val }))
                              .filter(log => getColomboDateString(log.timestamp) === selectedFilterDate)
                              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                          : [];

                        let totalMs = 0;
                        let activeInTime: number | null = null;
                        for (const log of sortedLogs) {
                          if (log.status === 'IN') {
                            if (activeInTime === null) {
                              activeInTime = new Date(log.timestamp).getTime();
                            }
                          } else if (log.status === 'OUT') {
                            if (activeInTime !== null) {
                              totalMs += new Date(log.timestamp).getTime() - activeInTime;
                              activeInTime = null;
                            }
                          }
                        }
                        if (activeInTime !== null) {
                          if (isToday) {
                            totalMs += Math.max(0, Date.now() - activeInTime);
                          }
                        } else if (isToday && staff.is_present && sortedLogs.length === 0) {
                          const allLogs = staff.logs 
                            ? Object.entries(staff.logs)
                                .map(([id, val]: [string, any]) => ({ id, ...val }))
                                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                            : [];
                          const globalInLogs = allLogs.filter(l => l.status === 'IN');
                          if (globalInLogs.length > 0) {
                            const lastInTime = new Date(globalInLogs[globalInLogs.length - 1].timestamp).getTime();
                            totalMs += Math.max(0, Date.now() - lastInTime);
                          }
                        }
                        totalLoggedMs += totalMs;
                      });

                      const displayHours = (totalLoggedMs / (1000 * 60 * 60)).toFixed(1);

                      return (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-slate-800 dark:text-slate-200">
                          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
                            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Registered Staff</span>
                            <span className="text-2xl font-bold block mt-1 font-mono">{staffList.length}</span>
                            <span className="text-[10px] text-slate-400 mt-0.5 block">Total roster entries</span>
                          </div>
                          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
                            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Active Today</span>
                            <span className="text-2xl font-bold text-teal-500 dark:text-teal-400 block mt-1 font-mono">{activeCount}</span>
                            <span className="text-[10px] text-slate-400 mt-0.5 block">Swiped on this date</span>
                          </div>
                          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
                            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Checked In Now</span>
                            <span className="text-2xl font-bold text-brand-blue dark:text-brand-green block mt-1 font-mono">{presentCount}</span>
                            <span className="text-[10px] text-slate-400 mt-0.5 block">Currently serving shifts</span>
                          </div>
                          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
                            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Total Work Hours</span>
                            <span className="text-2xl font-bold text-amber-500 block mt-1 font-mono">{displayHours}h</span>
                            <span className="text-[10px] text-slate-400 mt-0.5 block">Cumulative shift duration</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Filter and Table Container */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                      {/* Search Bar */}
                      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Filter attendance register by staff name, department, or role..."
                            value={registerSearch}
                            onChange={(e) => setRegisterSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue dark:text-slate-200 font-medium"
                          />
                        </div>
                        {registerSearch && (
                          <button
                            type="button"
                            onClick={() => setRegisterSearch('')}
                            className="px-3 py-2 text-xs text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 font-bold"
                          >
                            Clear Filter
                          </button>
                        )}
                      </div>

                      {/* Register Table */}
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left min-w-[900px]">
                          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-widest font-black">
                            <tr>
                              <th className="px-8 py-4">Staff Member</th>
                              <th className="px-8 py-4">Register Status</th>
                              <th className="px-8 py-4">First Swipe (In)</th>
                              <th className="px-8 py-4">Latest Swipe (Out)</th>
                              <th className="px-8 py-4">Hours Today</th>
                              <th className="px-8 py-4 text-right">Register Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(() => {
                              const filtered = staffList.filter(s => 
                                !registerSearch || 
                                s.name?.toLowerCase().includes(registerSearch.toLowerCase()) || 
                                s.department?.toLowerCase().includes(registerSearch.toLowerCase()) || 
                                s.role?.toLowerCase().includes(registerSearch.toLowerCase())
                              );

                              if (filtered.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={6} className="px-8 py-16 text-center text-slate-400 dark:text-slate-600 text-xs italic font-semibold">
                                      {registerSearch ? 'No staff matched your query.' : 'No personnel registered.'}
                                    </td>
                                  </tr>
                                );
                              }

                              return filtered.map(staff => {
                                const dateLogs = staff.logs 
                                  ? Object.entries(staff.logs)
                                      .map(([id, val]: [string, any]) => ({ id, ...val }))
                                      .filter(log => getColomboDateString(log.timestamp) === selectedFilterDate)
                                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                  : [];
                                
                                const allInLogs = staff.logs 
                                  ? Object.entries(staff.logs)
                                      .map(([id, val]: [string, any]) => ({ id, ...val }))
                                      .filter(l => l.status === 'IN')
                                      .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                  : [];
                                
                                const todayStr = getColomboDateString(new Date().toISOString());
                                const isTodayValue = selectedFilterDate === todayStr;
                                
                                const inLogs = dateLogs.filter(l => l.status === 'IN');
                                const outLogs = dateLogs.filter(l => l.status === 'OUT');
                                
                                const firstInTime = inLogs.length > 0
                                  ? new Date(inLogs[0].timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' })
                                  : (isTodayValue && staff.is_present && allInLogs.length > 0)
                                    ? new Date(allInLogs[allInLogs.length - 1].timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' })
                                    : null;
                                const dummyFirstInVal = false ? "" : inLogs.length > 0 
                                  ? new Date(inLogs[0].timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' }) 
                                  : null;
                                  
                                const lastOutTime = outLogs.length > 0 
                                  ? new Date(outLogs[outLogs.length - 1].timestamp).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' }) 
                                  : null;

                                // Shift calculation state
                                let totalMs = 0;
                                if (selectedFilterDate === todayStr && staff.is_present && dateLogs.length === 0) {
                                  const allLogs = staff.logs 
                                    ? Object.entries(staff.logs)
                                        .map(([id, val]: [string, any]) => ({ id, ...val }))
                                        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                    : [];
                                  const globalInLogs = allLogs.filter(l => l.status === 'IN');
                                  if (globalInLogs.length > 0) {
                                    const lastInTime = new Date(globalInLogs[globalInLogs.length - 1].timestamp).getTime();
                                    totalMs += Math.max(0, Date.now() - lastInTime);
                                  }
                                }
                                let activeInTime: number | null = null;
                                for (const log of dateLogs) {
                                  if (log.status === 'IN') {
                                    if (activeInTime === null) {
                                      activeInTime = new Date(log.timestamp).getTime();
                                    }
                                  } else if (log.status === 'OUT') {
                                    if (activeInTime !== null) {
                                      totalMs += new Date(log.timestamp).getTime() - activeInTime;
                                      activeInTime = null;
                                    }
                                  }
                                }
                                if (activeInTime !== null) {
                                  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
                                  if (selectedFilterDate === todayStr) {
                                    totalMs += Math.max(0, Date.now() - activeInTime);
                                  }
                                }

                                // Status resolve
                                let statusType: 'absent' | 'completed' | 'present' = 'absent';
                                if (dateLogs.length > 0) {
                                  const lastLog = dateLogs[dateLogs.length - 1];
                                  if (lastLog.status === 'IN') {
                                    statusType = 'present';
                                  } else {
                                    statusType = 'completed';
                                  }
                                }

                                if (statusType === 'absent' && isTodayValue && staff.is_present) {
                                  statusType = 'present';
                                }
                                const isToday = isTodayValue;
                                const original_isToday_value_consumed = false ? "" : selectedFilterDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

                                return (
                                  <tr key={staff.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                                    {/* Personnel Info */}
                                    <td className="px-8 py-4">
                                      <div className="flex items-center space-x-3">
                                        <div className="w-9 h-9 rounded-full bg-brand-blue/10 text-brand-blue dark:bg-slate-800 dark:text-brand-green flex items-center justify-center font-bold text-xs uppercase">
                                          {(staff.name || 'Staff').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ST'}
                                        </div>
                                        <div>
                                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{staff.name}</div>
                                          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">{staff.role || 'Staff Member'} • {staff.department || 'General'}</div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Register Status Badge */}
                                    <td className="px-8 py-4">
                                      {statusType === 'present' ? (
                                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider inline-flex items-center space-x-1.5 bg-brand-green/10 text-brand-green border border-brand-green/20">
                                          <span className="relative flex h-1.5 w-1.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-green"></span>
                                          </span>
                                          <span>Present Now</span>
                                        </span>
                                      ) : statusType === 'completed' ? (
                                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider inline-flex items-center space-x-1.5 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                                          <span>Completed Shift</span>
                                        </span>
                                      ) : (
                                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wider inline-flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500">
                                          <span>Absent</span>
                                        </span>
                                      )}
                                    </td>

                                    {/* First Swipe */}
                                    <td className="px-8 py-4 font-mono text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                                      {firstInTime ? (
                                        <span className="flex items-center space-x-1 text-brand-green font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-brand-green inline-block"></span>
                                          <span>{firstInTime}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-705">—</span>
                                      )}
                                    </td>

                                    {/* Latest Swipe */}
                                    <td className="px-8 py-4 font-mono text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                                      {lastOutTime ? (
                                        <span className="flex items-center space-x-1 text-amber-500 font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                                          <span>{lastOutTime}</span>
                                        </span>
                                      ) : statusType === 'present' ? (
                                        <span className="text-brand-green text-[9px] font-bold uppercase tracking-wide">Active Session</span>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-705">—</span>
                                      )}
                                    </td>

                                    {/* Logged Work Time */}
                                    <td className="px-8 py-4 font-mono text-xs font-semibold text-slate-700 dark:text-slate-350">
                                      {totalMs > 0 ? (
                                        <span className="bg-slate-50 dark:bg-slate-800/80 p-1.5 px-2.5 rounded-xl border border-slate-100 dark:border-slate-800 font-bold font-mono">
                                          {formatDuration(totalMs)}
                                        </span>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-705">—</span>
                                      )}
                                    </td>

                                    {/* Manual Register Swipe Action */}
                                    <td className="px-8 py-4 text-right">
                                      {isToday ? (
                                        <button
                                          type="button"
                                          onClick={() => toggleStaffPresence(staff.id, statusType === 'present')}
                                          className={cn(
                                            "px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center space-x-1",
                                            statusType === 'present'
                                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/15"
                                              : "bg-brand-green/15 text-brand-green border border-brand-green/20 hover:bg-brand-green/20"
                                          )}
                                        >
                                          {statusType === 'present' ? (
                                            <span>Punch OUT</span>
                                          ) : (
                                            <span>Punch IN</span>
                                          )}
                                        </button>
                                      ) : (
                                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/50 p-1 px-2 rounded-lg border border-slate-100/50 dark:border-slate-800 flex items-center space-x-1 inline-flex justify-end">
                                          <Lock className="w-3 h-3 text-slate-400" />
                                          <span>Past Date</span>
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-8">
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
                                        setInspectorTab('profile');
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
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'notices' && (
              <motion.div 
                key="notices"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col gap-8"
              >
                {/* Post Announcement Section */}
                <div className="w-full flex flex-col space-y-8">
                  <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-6 flex items-center">
                      <Mail className="w-4 h-4 mr-2 text-brand-green" />
                      Post Announcement
                    </h3>
                    <div className="space-y-4">
                      {announcementSuccess && (
                        <div id="announcement-success-banner" className="p-4 bg-emerald-500/10 text-emerald-650 dark:text-emerald-400 text-xs font-bold rounded-2xl border border-emerald-500/20 shadow-sm animate-fade-in flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-ping" />
                          Notice published successfully!
                        </div>
                      )}
                      {announcementError && (
                        <div id="announcement-error-banner" className="p-4 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium rounded-2xl border border-red-500/20 shadow-sm animate-fade-in">
                          <p className="font-bold uppercase tracking-wider text-[10px] text-red-500 mb-0.5">Posting Failed</p>
                          <p>{announcementError}</p>
                        </div>
                      )}
                      <textarea 
                        id="notices-announcement-textarea"
                        rows={4}
                        placeholder="Type important notice for students..."
                        value={announcementText}
                        onChange={(e) => setAnnouncementText(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:text-slate-200 transition-all resize-none"
                      />
                      <button 
                        id="notices-post-button"
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
                <div className="w-full">
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
                {/* Analytics Multi-Metric Overview Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Peak Occupancy (All-Time)</p>
                      <p className="text-3xl font-black text-slate-800 dark:text-white font-mono">
                        {peakOccupancyAllTime}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] bg-red-500/10 text-red-500 px-2.5 py-0.5 rounded-lg font-black uppercase tracking-wider">Historical Max</span>
                      <TrendingUp className="w-5 h-5 text-red-500 opacity-60" />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Avg. Occupancy (All-Time)</p>
                      <p className="text-3xl font-black text-slate-800 dark:text-white font-mono">
                        {averageOccupancyAllTime}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] bg-brand-blue/10 text-brand-blue px-2.5 py-0.5 rounded-lg font-black uppercase tracking-wider">Overall Mean</span>
                      <BarChart3 className="w-5 h-5 text-brand-blue opacity-60" />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Predicted Peak Hour</p>
                      <p className="text-2xl font-black text-teal-600 dark:text-teal-400 tracking-tight font-sans">
                        {predictedPeakHour}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2.5 py-0.5 rounded-lg font-black uppercase tracking-wider animate-pulse">Smart Forecast</span>
                      <Clock className="w-5 h-5 text-teal-500 opacity-60" />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Saved Samples Log</p>
                      <p className="text-3xl font-black text-slate-800 dark:text-white font-mono">
                        {rawHistoryData.length}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4 gap-2">
                      <button
                        onClick={downloadHistoricalCSV}
                        className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-extrabold text-[9px] uppercase tracking-widest px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                    </div>
                  </div>
                </div>

                {/* Grid layout for Occupancy charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Chart 1: Real-Time / Sliced Occupancy Trends */}
                  <section className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-8 shadow-sm flex flex-col h-[480px]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                      <div>
                        <h3 className="text-xs font-black text-slate-800 dark:text-white tracking-tight uppercase">Recent Trends</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold mt-0.5">Continuous plot for the last 24 recorded points</p>
                      </div>
                      <span className="self-start sm:self-auto px-3 py-1 bg-brand-blue/10 text-brand-blue text-[9px] font-black uppercase tracking-widest rounded-lg border border-brand-blue/15">Active Feed</span>
                    </div>

                    <div className="flex-1 min-h-0 w-full">
                      {historyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={historyData}>
                            <defs>
                              <linearGradient id="colorOccReport" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2D60FF" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="#2D60FF" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis 
                              dataKey="timestamp" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 750 }}
                              dy={8}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 750 }}
                              dx={-6}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                borderRadius: '16px', 
                                border: '1px solid #E2E8F0', 
                                boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                                backgroundColor: '#FFF',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#1E293B'
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="occupancy" 
                              stroke="#2D60FF" 
                              strokeWidth={3} 
                              fillOpacity={1} 
                              fill="url(#colorOccReport)" 
                              animationDuration={1000}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs italic font-semibold">
                          No recent trend entries found.
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Chart 2: Hourly Crowd Density Distribution Profile */}
                  <section className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200/60 dark:border-slate-800 p-8 shadow-sm flex flex-col h-[480px]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                      <div>
                        <h3 className="text-xs font-black text-slate-800 dark:text-white tracking-tight uppercase">Daily Crowd Distribution</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold mt-0.5">Average occupancy counts grouped by hour of the day</p>
                      </div>
                      <span className="self-start sm:self-auto px-3 py-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-teal-500/15">Hourly Profile</span>
                    </div>

                    <div className="flex-1 min-h-0 w-full">
                      {hourlyOccupancyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hourlyOccupancyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis 
                              dataKey="hourLabel" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 8, fontWeight: 750 }}
                              dy={8}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 750 }}
                              dx={-6}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                borderRadius: '16px', 
                                border: '1px solid #E2E8F0', 
                                boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                                backgroundColor: '#FFF',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#1E293B'
                              }}
                            />
                            <Bar 
                              dataKey="occupancy" 
                              fill="#2D60FF" 
                              radius={[6, 6, 0, 0]}
                              className="fill-brand-blue"
                              maxBarSize={28}
                              animationDuration={1200}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs italic font-semibold">
                          Awaiting historical database logs.
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Smart Analytics Insight Panel */}
                <div className="bg-slate-50 dark:bg-slate-800/30 rounded-[32px] border border-slate-100 dark:border-slate-800 p-6 flex items-start gap-4 transition-all">
                  <div className="p-2.5 bg-brand-blue/10 text-brand-blue dark:bg-brand-green/20 dark:text-brand-green rounded-2xl shrink-0 mt-0.5">
                    <Info className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase text-slate-750 dark:text-white tracking-widest">IoT Resource Recommendation Summary</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed font-semibold">
                      Based on continuous background telemetry patterns, Peak system congestion aligns closest around the <strong className="text-brand-blue dark:text-brand-green">{predictedPeakHour}</strong> window. 
                      To optimize electricity consumption and staff resources, consider activating the SeatIdle ESP physical node scanning module 1 hour prior (starting at {busiestPredictionObj.hourNumber > 0 ? `${(busiestPredictionObj.hourNumber - 1) % 12 === 0 ? 12 : (busiestPredictionObj.hourNumber - 1) % 12} ${busiestPredictionObj.hourNumber - 1 >= 12 ? 'PM' : 'AM'}` : 'N/A'}) to capture the incoming crowd rush smoothly.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'issues' && (
              <motion.div
                key="issues"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200/60 dark:border-slate-800 p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.012)] transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-805/80 pb-5">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Student Facility & System Issues</h2>
                      <p className="text-[10px] text-slate-450 dark:text-slate-500 font-medium">Coordinate student reports and physical library hardware fixes</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border border-slate-200/40 dark:border-slate-700">
                        Total: {reportedIssuesList.length} Case(s)
                      </span>
                      <span className="bg-red-500/10 text-red-650 dark:bg-red-950/20 dark:text-red-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border border-red-200/30">
                        {reportedIssuesList.filter(i => i.status === 'pending').length} Pending
                      </span>
                    </div>
                  </div>

                  {/* Filter and Search Panels */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                    {/* Search box */}
                    <div className="relative md:col-span-1">
                      <Search className="absolute left-3.5 top-3.5 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={issuesSearch}
                        onChange={(e) => setIssuesSearch(e.target.value)}
                        placeholder="Search cases, emails..."
                        className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>

                    {/* Status select */}
                    <div>
                      <select
                        value={issuesStatusFilter}
                        onChange={(e) => setIssuesStatusFilter(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="all">All Statuses</option>
                        <option value="pending">Awaiting Action</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>

                    {/* Urgency select */}
                    <div>
                      <select
                        value={issuesUrgencyFilter}
                        onChange={(e) => setIssuesUrgencyFilter(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="all font-semibold">All Urgencies</option>
                        <option value="low">Low Priority</option>
                        <option value="medium">Medium Priority</option>
                        <option value="critical">Critical Priority</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Issues Lists Render */}
                {reportedIssuesList.filter(issue => {
                  if (issuesStatusFilter !== 'all' && issue.status !== issuesStatusFilter) return false;
                  if (issuesUrgencyFilter !== 'all' && issue.urgency !== issuesUrgencyFilter) return false;
                  if (issuesSearch.trim() !== '') {
                    const q = issuesSearch.toLowerCase();
                    const matchDesc = (issue.description || '').toLowerCase().includes(q);
                    const matchEmail = (issue.reporterEmail || '').toLowerCase().includes(q);
                    const matchType = (issue.issueType || '').toLowerCase().includes(q);
                    return matchDesc || matchEmail || matchType;
                  }
                  return true;
                }).length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200/60 dark:border-slate-800 p-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.012)]">
                    <Check className="w-12 h-12 text-slate-300 dark:text-slate-755 mx-auto mb-3" />
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-205 uppercase tracking-wider">All Clear</h3>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-sm mx-auto leading-relaxed mt-1">
                      No student issues or facility flags match the current filters. Your library status is completely synchronized!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reportedIssuesList.filter(issue => {
                      if (issuesStatusFilter !== 'all' && issue.status !== issuesStatusFilter) return false;
                      if (issuesUrgencyFilter !== 'all' && issue.urgency !== issuesUrgencyFilter) return false;
                      if (issuesSearch.trim() !== '') {
                        const q = issuesSearch.toLowerCase();
                        const matchDesc = (issue.description || '').toLowerCase().includes(q);
                        const matchEmail = (issue.reporterEmail || '').toLowerCase().includes(q);
                        const matchType = (issue.issueType || '').toLowerCase().includes(q);
                        return matchDesc || matchEmail || matchType;
                      }
                      return true;
                    }).map((issue) => {
                      const formattedDate = new Date(issue.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      });

                      return (
                        <div
                          key={issue.id}
                          className={cn(
                            "bg-white dark:bg-slate-900 border rounded-[24px] overflow-hidden shadow-sm flex flex-col justify-between transition-all",
                            issue.status === 'resolved'
                              ? "border-slate-200/50 dark:border-slate-800/50 opacity-75 animate-none"
                              : issue.urgency === 'critical'
                              ? "border-red-200 dark:border-red-900/40 ring-1 ring-red-500/10 dark:ring-red-500/5"
                              : issue.urgency === 'medium'
                              ? "border-amber-200 dark:border-amber-900/30"
                              : "border-slate-200/60 dark:border-slate-800"
                          )}
                        >
                          {/* Color Top Border Accent based on priority */}
                          <div className={cn(
                            "h-1 w-full",
                            issue.status === 'resolved'
                              ? 'bg-slate-250 dark:bg-slate-800'
                              : issue.urgency === 'critical'
                              ? 'bg-red-500 font-bold'
                              : issue.urgency === 'medium'
                              ? 'bg-amber-500'
                              : 'bg-brand-blue'
                          )} />

                          <div className="p-5 flex-1 space-y-3.5">
                            {/* Meta Indicators */}
                            <div className="flex items-center justify-between">
                              <span className={cn(
                                "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                                issue.issueType === 'occupancy_accuracy'
                                  ? "bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-teal-400 border-brand-blue/15"
                                  : issue.issueType === 'facility'
                                  ? "bg-amber-500/10 dark:bg-amber-955/20 text-amber-600 dark:text-amber-450 border-amber-500/15"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/60"
                              )}>
                                {issue.issueType === 'occupancy_accuracy' ? 'Occupancy Sync Check' : issue.issueType === 'facility' ? 'Facility Fault' : 'General Area Issue'}
                              </span>

                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider flex items-center gap-1",
                                issue.status === 'resolved'
                                  ? "bg-brand-green/10 text-brand-green dark:bg-brand-green/20"
                                  : "bg-amber-500/10 text-amber-550 dark:bg-amber-955/30 font-bold"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  issue.status === 'resolved' ? "bg-brand-green" : "bg-amber-400 animate-pulse"
                                )} />
                                {issue.status === 'resolved' ? 'Resolved' : 'Pending Action'}
                              </span>
                            </div>

                            {/* Details text area */}
                            <div className="space-y-1">
                              <p className="text-[11px] text-slate-650 dark:text-slate-350 font-medium leading-relaxed bg-slate-50/50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100/30 dark:border-slate-850">
                                {issue.description}
                              </p>
                            </div>

                            {/* reporter metadata details */}
                            <div className="flex items-center justify-between pt-1 text-[9px] text-slate-400 dark:text-slate-500 border-t border-slate-100/40 dark:border-slate-850 font-medium font-sans">
                              <div className="flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5 shrink-0" />
                                <span className="font-mono font-bold truncate max-w-[120px]">{issue.reporterEmail}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                <span>{formattedDate}</span>
                              </div>
                            </div>
                          </div>

                          {/* Control Actions footer */}
                          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-850 flex items-center gap-2">
                            {issue.status === 'pending' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await update(ref(database, `reported_issues/${issue.id}`), { status: 'resolved' });
                                }}
                                className="flex-1 bg-brand-green hover:bg-brand-green/95 text-white dark:bg-brand-green/20 dark:hover:bg-brand-green/35 dark:text-brand-green border border-brand-green/10 dark:border-brand-green/20 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                              >
                                <Check className="w-3 h-3" />
                                Mark as Fixed
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  await update(ref(database, `reported_issues/${issue.id}`), { status: 'pending' });
                                }}
                                className="flex-1 bg-slate-200 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-350 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                              >
                                <AlertCircle className="w-3 h-3" />
                                Reopen Case
                              </button>
                            )}

                            {confirmingIssueId === issue.id ? (
                              <div className="flex items-center gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await remove(ref(database, `reported_issues/${issue.id}`));
                                    } catch (err) {
                                      console.error("Delete issue error:", err);
                                    } finally {
                                      setConfirmingIssueId(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 text-[9px] font-black uppercase text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all cursor-pointer shadow-sm"
                                >
                                  Del!
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmingIssueId(null);
                                  }}
                                  className="px-2.5 py-1 text-[9px] font-black uppercase text-slate-500 bg-slate-150 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmingIssueId(issue.id);
                                }}
                                className="p-1.5 bg-red-100 hover:bg-red-200 text-red-650 dark:bg-red-950/20 dark:hover:bg-red-950/40 dark:text-red-450 rounded-lg transition-colors cursor-pointer border border-red-500/10 shrink-0"
                                title="Delete Case"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
          { id: 'issues', label: 'Issues', icon: AlertTriangle },
          { id: 'exit', label: 'Exit', icon: LogOut, isLink: true }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === 'exit' ? false : activeTab === tab.id;
          const pendingIssuesCount = reportedIssuesList.filter(iss => iss.status === 'pending').length;
          
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

              <div className="relative">
                <Icon className={cn(
                  "w-5 h-5 transition-transform duration-200", 
                  isActive 
                    ? "text-brand-blue dark:text-brand-green scale-110 stroke-[2.5]" 
                    : "text-slate-400 dark:text-slate-500"
                )} />
                {tab.id === 'issues' && pendingIssuesCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white rounded-full text-[7px] w-4.5 h-4.5 flex items-center justify-center font-bold">
                    {pendingIssuesCount}
                  </span>
                )}
              </div>
              
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

              {/* Tab Navigation inside Inspector */}
              <div className="flex border-b border-slate-100 dark:border-slate-800 mb-4 overflow-x-auto shrink-0 scrollbar-none">
                {[
                  { id: 'profile', label: 'Profile', icon: User },
                  { id: 'presence', label: 'RFID Scans', icon: Clock },
                  { id: 'analytics', label: 'Analytics', icon: BarChart3 }
                ].map((t) => {
                  const IconComponent = t.icon;
                  const isCurrent = inspectorTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInspectorTab(t.id as any)}
                      className={cn(
                        "flex items-center space-x-1.5 py-2 px-3 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all relative cursor-pointer mr-2 whitespace-nowrap",
                        isCurrent 
                          ? "border-brand-blue text-brand-blue dark:border-brand-green dark:text-brand-green" 
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      )}
                    >
                      <IconComponent className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Profile Details & Real-Time Attendance Monitoring */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                {inspectorTab === 'profile' && (
                  <div className="space-y-6">
                    {!isEditingProfile ? (
                      <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Personnel Profile Info</h4>
                          <button 
                            type="button"
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
                            type="button"
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
                          type="button"
                          onClick={() => updateStaffProfile(selectedStaff.id)}
                          className="w-full bg-brand-blue text-white py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-widest hover:bg-brand-blue/95 flex items-center justify-center mt-2"
                        >
                          Save Configuration
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-4 bg-blue-50/50 dark:bg-slate-800/10 border border-brand-blue/10 dark:border-slate-800 rounded-2xl">
                      <div>
                        <h5 className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Attendance Status Override</h5>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Override staff presence on server</p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => addManualLog(selectedStaff.id, 'IN', 'ADMIN_MANUAL_IN')}
                          disabled={selectedStaff.is_present}
                          className="px-3.5 py-1.5 bg-brand-green/20 text-brand-green hover:bg-brand-green/30 disabled:opacity-40 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer font-bold"
                        >
                          Manual In
                        </button>
                        <button
                          type="button"
                          onClick={() => addManualLog(selectedStaff.id, 'OUT', 'ADMIN_MANUAL_OUT')}
                          disabled={!selectedStaff.is_present}
                          className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 disabled:opacity-40 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer font-bold"
                        >
                          Manual Out
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {inspectorTab === 'presence' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center font-bold">
                        <Clock className="w-3.5 h-3.5 mr-1.5 text-brand-green" />
                        RFID Swipe Transactions Detail
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-md font-bold">
                        Total: {selectedStaff.logs ? Object.keys(selectedStaff.logs).length : 0} swipes
                      </span>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto bg-slate-50/30 dark:bg-slate-900/40">
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedStaff.logs && Object.keys(selectedStaff.logs).length > 0 ? (
                          Object.entries(selectedStaff.logs)
                            .map(([logId, val]: [string, any]) => ({ id: logId, ...val }))
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(log => (
                              <div key={log.id} className="flex items-center justify-between p-3.5 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all">
                                <div className="flex items-center space-x-3 text-xs">
                                  <span className={cn(
                                    "w-14 py-1 text-[8px] font-black tracking-widest text-center rounded-lg uppercase inline-block",
                                    log.status === 'IN' ? "bg-brand-green/10 text-brand-green" : "bg-red-500/10 text-red-500"
                                  )}>
                                    {log.status === 'IN' ? 'CHECK-IN' : 'CHECK-OUT'}
                                  </span>
                                  <div>
                                    <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 block">
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
                          <div className="p-12 text-center text-slate-400 dark:text-slate-600 text-xs italic font-medium">
                            No scan transactions recorded yet. RFID card events register here instantly.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {inspectorTab === 'analytics' && (
                  <div className="space-y-6">
                    {/* Metrics Dashboard Row */}
                    <div className="grid grid-cols-3 gap-3 text-slate-800 dark:text-slate-200">
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-slate-400 dark:text-slate-500 block text-[8px] uppercase font-black tracking-widest mb-1">Total Shifts</span>
                        <span className="text-xl font-bold font-mono block">{totalShiftCount}</span>
                      </div>
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-slate-400 dark:text-slate-500 block text-[8px] uppercase font-black tracking-widest mb-1">Total Hours</span>
                        <span className="text-xl font-bold font-mono text-brand-green block">{totalHours}h</span>
                      </div>
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-slate-400 dark:text-slate-500 block text-[8px] uppercase font-black tracking-widest mb-1">Avg Shift</span>
                        <span className="text-xl font-bold font-mono text-brand-blue block">{avgHoursPerShift}h</span>
                      </div>
                    </div>

                    {/* Chart section */}
                    <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                      <div className="mb-4">
                        <h5 className="text-[10px] font-black uppercase text-slate-705 dark:text-white tracking-widest">Presence Hours by Weekday</h5>
                        <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Total registered swipe duration aggregated by day</p>
                      </div>

                      <div className="h-[160px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dayData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-slate-800" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 750 }}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 750 }}
                              dx={-4}
                            />
                            <Tooltip
                              contentStyle={{ 
                                borderRadius: '12px', 
                                border: '1px solid #ECEFF1', 
                                backgroundColor: '#FFFFFF',
                                fontSize: '10px',
                                fontWeight: 650,
                                color: '#1E293B'
                              }}
                            />
                            <Bar 
                              dataKey="Hours" 
                              fill="#0ea5e9"
                              className="fill-brand-blue dark:fill-brand-green"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={18}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Report Export Trigger Block */}
                    <div className="p-4 bg-brand-blue/5 dark:bg-brand-green/5 border border-brand-blue/10 dark:border-brand-green/10 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <h5 className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">Download Attendance File</h5>
                        <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">Generates a CSV spreadsheet compiling deep swipe details and session reports.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportCSV}
                        className="flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-brand-blue dark:bg-brand-green text-white dark:text-slate-950 hover:opacity-90 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm font-bold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </button>
                    </div>

                  </div>
                )}
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
