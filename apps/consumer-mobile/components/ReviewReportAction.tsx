import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { reportReview, type SafetyReportReason } from '../services/safety';

const REPORT_REASONS: Array<{ value: SafetyReportReason; label: string; detail: string }> = [
  { value: 'unsafe', label: 'Unsafe or dangerous', detail: 'Encourages unsafe behavior or could put someone at risk.' },
  { value: 'harassment', label: 'Harassment or bullying', detail: 'Targets or intimidates another person.' },
  { value: 'hate', label: 'Hate or hateful conduct', detail: 'Attacks people based on a protected characteristic.' },
  { value: 'sexual', label: 'Sexual content', detail: 'Contains sexual or sexually exploitative material.' },
  { value: 'privacy', label: 'Privacy or personal information', detail: 'Shares private or identifying information inappropriately.' },
  { value: 'spam', label: 'Spam or promotion', detail: 'Irrelevant promotion, repetition, or deceptive solicitation.' },
  { value: 'inaccurate', label: 'Misleading or inaccurate', detail: 'Contains materially false or misleading restroom information.' },
  { value: 'other', label: 'Something else', detail: 'Another Community Guidelines or safety concern.' },
];

type Props = {
  reviewId: string;
  onReported?: () => void;
};

export default function ReviewReportAction({ reviewId, onReported }: Props) {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<SafetyReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function open() {
    setReason(null);
    setDetails('');
    setError('');
    setVisible(true);
  }

  function close() {
    if (submitting) return;
    setVisible(false);
  }

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await reportReview(reviewId, reason, details);
      setVisible(false);
      onReported?.();
    } catch (cause: any) {
      const message = String(cause?.message || cause || '');
      if (message.includes('REVIEW_ALREADY_REPORTED_BY_USER')) {
        setError("You've already reported this review. It remains in the moderation queue.");
      } else if (message.includes('AUTH_REQUIRED')) {
        setError('Sign in before reporting a review.');
      } else {
        setError('The report could not be submitted. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Report review" style={styles.reportButton} onPress={open}>
      <Text style={styles.reportButtonText}>Report review</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>COMMUNITY SAFETY</Text>
              <Text style={styles.title}>Why are you reporting this review?</Text>
              <Text style={styles.body}>Choose the closest reason. Reports go to Kleenest moderation and are not shown to the contributor.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close report review" hitSlop={10} onPress={close} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.reasonList} keyboardShouldPersistTaps="handled">
            {REPORT_REASONS.map((option) => {
              const selected = reason === option.value;
              return <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setReason(option.value)}
                style={[styles.reason, selected && styles.reasonSelected]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot}/> : null}</View>
                <View style={styles.reasonCopy}>
                  <Text style={styles.reasonLabel}>{option.label}</Text>
                  <Text style={styles.reasonDetail}>{option.detail}</Text>
                </View>
              </Pressable>;
            })}
            <Text style={styles.detailsLabel}>OPTIONAL DETAILS</Text>
            <TextInput
              accessibilityLabel="Additional report details"
              value={details}
              onChangeText={setDetails}
              maxLength={1000}
              multiline
              textAlignVertical="top"
              placeholder="Add context that will help moderation understand the concern."
              style={styles.detailsInput}
            />
            <Text style={styles.counter}>{details.length}/1000</Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={close} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit review report"
              accessibilityState={{ disabled: !reason || submitting }}
              disabled={!reason || submitting}
              onPress={() => { void submit(); }}
              style={[styles.submitButton, (!reason || submitting) && styles.submitDisabled]}
            >
              <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit report'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  reportButton: { backgroundColor: '#fff1ef', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  reportButtonText: { color: '#8b3e37', fontSize: 11, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14, 27, 20, 0.46)' },
  sheet: { maxHeight: '88%', backgroundColor: '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 18, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { color: '#557060', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#183326', fontSize: 23, lineHeight: 28, fontWeight: '900' },
  body: { color: '#5c6e64', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#edf3ef', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#214d36', fontSize: 25, lineHeight: 27, fontWeight: '800' },
  reasonList: { gap: 9, paddingBottom: 6 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderColor: '#d6e0da', borderRadius: 15, padding: 12, backgroundColor: '#fbfcfb' },
  reasonSelected: { borderColor: '#397055', backgroundColor: '#eef6f1' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#93a69a', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioSelected: { borderColor: '#2b6246' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2b6246' },
  reasonCopy: { flex: 1, gap: 2 },
  reasonLabel: { color: '#21382c', fontSize: 14, fontWeight: '900' },
  reasonDetail: { color: '#66786e', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  detailsLabel: { marginTop: 5, color: '#557060', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  detailsInput: { minHeight: 94, borderWidth: 1, borderColor: '#cbd8d0', borderRadius: 14, backgroundColor: '#f8fbf9', padding: 12, color: '#21382c', fontSize: 13 },
  counter: { alignSelf: 'flex-end', color: '#77877e', fontSize: 10, fontWeight: '700' },
  error: { color: '#963d35', backgroundColor: '#fff1ef', borderRadius: 11, padding: 10, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', backgroundColor: '#eef3f0' },
  cancelText: { color: '#315440', fontWeight: '900' },
  submitButton: { flex: 1.35, borderRadius: 14, padding: 14, alignItems: 'center', backgroundColor: '#245c40' },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#ffffff', fontWeight: '900' },
});
