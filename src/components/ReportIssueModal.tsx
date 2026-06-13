import { useState, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Check, Send, AlertCircle, Info, Mail } from 'lucide-react';
import { database, ref, push } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReportIssueModal({ isOpen, onClose }: ReportIssueModalProps) {
  const { user } = useAuth();
  
  // Form states
  const [issueType, setIssueType] = useState<'occupancy_accuracy' | 'facility' | 'other'>('occupancy_accuracy');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'critical'>('low');
  const [description, setDescription] = useState<string>('');
  const [reporterEmail, setReporterEmail] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  
  // UX states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [generatedId, setGeneratedId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize and update defaults based on user auth status
  useEffect(() => {
    if (isOpen) {
      if (user) {
        setReporterEmail(user.email || '');
        setIsAnonymous(false);
      } else {
        setReporterEmail('');
        setIsAnonymous(false);
      }
      // Reset form states
      setIssueType('occupancy_accuracy');
      setUrgency('low');
      setDescription('');
      setSubmitSuccess(false);
      setGeneratedId('');
      setErrorMsg(null);
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 8) {
      setErrorMsg('Please write a descriptive explanation of the issue (at least 8 characters).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const emailToSave = isAnonymous ? 'anonymous' : (reporterEmail.trim() || 'anonymous');

    const reportData = {
      issueType,
      zone: 'general',
      deskNum: 'General Area',
      description: description.trim(),
      urgency,
      reporterEmail: emailToSave,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      const issueRef = ref(database, 'reported_issues');
      const result = await push(issueRef, reportData);
      
      setGeneratedId(result.key || Math.random().toString(36).slice(2, 8).toUpperCase());
      setSubmitSuccess(true);
    } catch (err: any) {
      console.error('Failed to submit feedback:', err);
      setErrorMsg('Could not submit the report. There was a connector error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="report-issue-root" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-sm"
          />

          {/* Modal Content Drawer Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-2xl p-5 sm:p-7 overflow-hidden z-10 transition-colors"
          >
            {/* Header Accent Bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 h-1.5 transition-colors",
              urgency === 'critical' ? 'bg-red-500' : urgency === 'medium' ? 'bg-amber-500' : 'bg-brand-blue'
            )} />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer"
              aria-label="Close Modal"
            >
              <X className="w-4 h-4" />
            </button>

            {!submitSuccess ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-brand-blue/10 dark:bg-brand-blue/20 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800 dark:text-white tracking-tight leading-none">Report Issue / Feedback</h2>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Verify system occupancy reports or flag library faults</p>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-[11px] font-medium flex items-start gap-2 animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Issue Type Tabs */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Report Format</label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50 dark:bg-slate-950/80 rounded-xl border border-slate-100 dark:border-slate-850">
                    {[
                      { id: 'occupancy_accuracy', label: 'Occupancy Check' },
                      { id: 'facility', label: 'Facility Fault' },
                      { id: 'other', label: 'General' }
                    ].map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setIssueType(type.id as any)}
                        className={cn(
                          "py-2 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                          issueType === type.id
                            ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm font-black border border-slate-200/50 dark:border-slate-700/50"
                            : "text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-400"
                        )}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urgency Level Buttons */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Urgency Indicator</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'low', label: 'Low', desc: 'Minor issue', color: 'border-slate-200 hover:border-brand-blue/40 text-slate-600 dark:text-slate-350 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20', activeColor: 'bg-brand-blue/10 border-brand-blue text-brand-blue dark:bg-brand-blue/20 dark:border-brand-blue' },
                      { id: 'medium', label: 'Medium', desc: 'Disruption', color: 'border-slate-200 hover:border-amber-500/40 text-slate-600 dark:text-slate-350 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20', activeColor: 'bg-amber-500/10 border-amber-500 text-amber-550 dark:bg-amber-950/30' },
                      { id: 'critical', label: 'Critical', desc: 'Outage/Danger', color: 'border-slate-200 hover:border-red-500/40 text-slate-600 dark:text-slate-350 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20', activeColor: 'bg-red-500/10 border-red-500 text-red-500 dark:bg-red-950/40' }
                    ].map(lvl => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setUrgency(lvl.id as any)}
                        className={cn(
                          "p-2 border rounded-xl flex flex-col items-center text-center transition-all cursor-pointer",
                          urgency === lvl.id ? lvl.activeColor : lvl.color
                        )}
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider">{lvl.label}</span>
                        <span className="text-[8px] font-medium opacity-80 leading-snug mt-0.5">{lvl.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description Textarea */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Describe the details</label>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 font-mono">Min 8 chars</span>
                  </div>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue or feedback here..."
                    rows={3}
                    className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200/65 dark:border-slate-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-blue/30 focus:border-brand-blue/40 font-medium"
                  />
                </div>

                {/* Contact Email Information */}
                {!user ? (
                  <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[9px] font-black uppercase text-slate-450 dark:text-slate-550 tracking-wider">Reporter Email</span>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAnonymous}
                          onChange={(e) => setIsAnonymous(e.target.checked)}
                          className="rounded border-slate-200 dark:border-slate-800 text-brand-blue focus:ring-0 w-3 h-3 cursor-pointer"
                        />
                        <span className="text-[9px] font-extrabold uppercase text-slate-400 dark:text-slate-500 tracking-wider select-none">Anonymous</span>
                      </label>
                    </div>

                    {!isAnonymous && (
                      <input
                        type="email"
                        required={!isAnonymous}
                        value={reporterEmail}
                        onChange={(e) => setReporterEmail(e.target.value)}
                        placeholder="e.g. your_email@student.com"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-650 focus:outline-none"
                      />
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-150/40 dark:border-slate-850 rounded-xl flex items-center justify-between text-[10px] select-none text-slate-600 dark:text-slate-455">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Check className="w-3.5 h-3.5 text-brand-green" />
                      <span>Filing with linked student account:</span>
                    </div>
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold text-slate-700 dark:text-slate-300">
                      {user.email || 'student'}
                    </span>
                  </div>
                )}

                {/* Call to Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-brand-blue hover:bg-brand-blue/95 text-white dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-slate-950 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    {isSubmitting ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/40 dark:border-slate-950/40 border-t-white dark:border-t-slate-950 rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    <span>{isSubmitting ? 'Submitting...' : 'Send Report'}</span>
                  </button>
                </div>
              </form>
            ) : (
              // Submission Success Area
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-14 h-14 bg-brand-green rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-lg shadow-brand-green/20 rotate-6 shrink-0">
                  <Check className="w-7 h-7 text-white -rotate-6 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-850 dark:text-white uppercase tracking-tight">Report Logged</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium px-2 leading-relaxed">
                    Thank you! Your feedback will help us synchronize actual desks with the live physical sensors and duty team.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 rounded-xl px-4 py-3 border border-slate-100 dark:border-slate-850 inline-block">
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5 p-0.5">Report Case Token</span>
                  <span className="text-base font-mono font-black text-brand-blue dark:text-brand-green tracking-wider uppercase">
                    #{generatedId.slice(0, 8)}
                  </span>
                </div>

                <div className="flex gap-2.5 text-left p-3.5 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-850/80 text-[10px] text-slate-500 dark:text-slate-420">
                  <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    A dispatcher from our staff team will inspect and address this promptly. You can monitor announcements for resolved flags.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-slate-105 hover:bg-slate-110 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-205 border border-slate-200/50 dark:border-slate-700/50 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                >
                  Return to Dashboard
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
