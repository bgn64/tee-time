/**
 * CommentsSection — comments thread + composer for a round.
 *
 * Renders the (already-deleted-filtered) list from
 * `useRoundComments` plus a sticky-feeling composer at the bottom.
 * Author-only Edit and Delete are inline on each comment row;
 * Edit swaps the body text for an input, Save calls `editComment`.
 *
 * Round-owner badge: a comment authored by the round's
 * `ownerUserId` gets a small "scorer" accent next to the handle so
 * viewers know the comment is from the person who played.
 *
 * Author identity (avatar / handle) comes from `useProfile` (same
 * resolver the feed band uses). Unfriended ex-friends still
 * resolve via the direct-Supabase fetch fallback that lives there.
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  type Comment,
  editComment,
  postComment,
  softDeleteComment,
  useRoundComments,
} from '@/library/comments/useRoundComments';
import { formatRelativeTime } from '@/library/golf/scoring';
import { useSystem } from '@/library/powersync/system';
import { useAccount } from '@/library/social/AccountContext';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';

type Props = {
  roundId: string;
  /** Round owner — flagged with the "scorer" badge in the thread. */
  ownerUserId: string;
};

export function CommentsSection({ roundId, ownerUserId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const system = useSystem();
  const { account } = useAccount();
  const signedInUserId = account?.userId ?? null;

  const { comments, isLoading } = useRoundComments(roundId);

  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const canSend = !posting && trimmed.length > 0 && !!signedInUserId;

  async function handleSend() {
    if (!canSend || !signedInUserId) return;
    setPosting(true);
    setPostError(null);
    try {
      await postComment(system, {
        roundId,
        authorUserId: signedInUserId,
        body: trimmed,
      });
      setDraft('');
    } catch (e) {
      setPostError(e instanceof Error ? e.message : 'Could not send comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>COMMENTS</Text>
        <Text style={styles.headCount}>{comments.length}</Text>
      </View>

      {isLoading && comments.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : comments.length === 0 ? (
        <Text style={styles.empty}>No comments yet — be the first.</Text>
      ) : (
        <View style={styles.list}>
          {comments.map((c, idx) => (
            <View key={c.id} style={idx === 0 ? null : styles.commentSep}>
              <CommentRow
                comment={c}
                isOwnerComment={c.authorUserId === ownerUserId}
                isOwn={c.authorUserId === signedInUserId}
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={
            signedInUserId ? 'Write a comment…' : 'Sign in to comment'
          }
          placeholderTextColor={colors.textMuted}
          editable={!!signedInUserId && !posting}
          maxLength={1000}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          accessibilityLabel="Send comment"
          accessibilityState={{ disabled: !canSend }}>
          {posting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.sendText, !canSend && styles.sendTextDisabled]}>
              Send
            </Text>
          )}
        </Pressable>
      </View>
      {postError ? (
        <Text style={styles.error}>{postError}</Text>
      ) : null}
    </View>
  );
}

type RowProps = {
  comment: Comment;
  /** True when this comment's author is the round's scorer. */
  isOwnerComment: boolean;
  /** True when this comment was authored by the signed-in user. */
  isOwn: boolean;
};

function CommentRow({ comment, isOwnerComment, isOwn }: RowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const system = useSystem();
  const { profile } = useProfile(comment.authorUserId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = profile?.displayName?.trim() || 'Player';
  const handle = profile?.handle ? `@${profile.handle}` : displayName;
  const avatarColor = profile?.avatarColor ?? colors.primary;
  const initial = (displayName[0] ?? '?').toUpperCase();

  async function handleSaveEdit() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (trimmed === comment.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await editComment(system, { commentId: comment.id, body: trimmed });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save edit.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await softDeleteComment(system, comment.id);
      // No state to flip — the next sync tick removes us from the
      // useRoundComments query result and we unmount.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete comment.');
      setBusy(false);
    }
  }

  return (
    <View style={[styles.commentRow, isOwn && styles.commentRowOwn]}>
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.avatarLetter}>{initial}</Text>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={styles.commentHandle} numberOfLines={1}>
            {handle}
          </Text>
          {isOwnerComment ? (
            <Text style={styles.scorerBadge}>· SCORER</Text>
          ) : null}
          <Text style={styles.commentWhen}>
            · {formatRelativeTime(comment.createdAt)}
          </Text>
          {comment.edited ? (
            <Text style={styles.commentEdited}>· edited</Text>
          ) : null}
        </View>
        {editing ? (
          <View style={styles.editBlock}>
            <TextInput
              style={styles.editInput}
              value={draft}
              onChangeText={setDraft}
              autoFocus
              maxLength={1000}
              multiline
              editable={!busy}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => {
                  setDraft(comment.body);
                  setEditing(false);
                  setError(null);
                }}
                disabled={busy}>
                <Text style={styles.editActionMuted}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveEdit} disabled={busy}>
                <Text style={styles.editActionPrimary}>
                  {busy ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.commentText}>{comment.body}</Text>
        )}
        {isOwn && !editing ? (
          <View style={styles.actionRow}>
            <Pressable onPress={() => setEditing(true)} disabled={busy}>
              <Text style={styles.actionMuted}>Edit</Text>
            </Pressable>
            <Pressable onPress={handleDelete} disabled={busy}>
              <Text style={styles.actionDanger}>
                {busy ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={styles.rowError}>{error}</Text> : null}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    head: {
      padding: 10,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headTitle: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    headCount: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textTitle,
    },
    loading: {
      padding: 22,
      alignItems: 'center',
    },
    empty: {
      padding: 18,
      paddingHorizontal: 14,
      color: colors.textMuted,
      fontSize: 12,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    list: { paddingVertical: 4 },
    commentSep: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    commentRow: {
      flexDirection: 'row',
      padding: 10,
      paddingHorizontal: 14,
      gap: 10,
    },
    commentRowOwn: {
      backgroundColor: 'rgba(47, 125, 75, 0.04)',
    },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarLetter: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
    },
    commentBody: {
      flex: 1,
      minWidth: 0,
    },
    commentMeta: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 2,
    },
    commentHandle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
      maxWidth: 160,
    },
    scorerBadge: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: colors.primary,
    },
    commentWhen: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    commentEdited: {
      fontSize: 11,
      fontStyle: 'italic',
      color: colors.textMuted,
    },
    commentText: {
      fontSize: 13.5,
      lineHeight: 18,
      color: colors.textBody,
    },
    editBlock: {
      gap: 8,
      marginTop: 4,
    },
    editInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 8,
      fontSize: 13,
      color: colors.textTitle,
      minHeight: 40,
    },
    editActions: {
      flexDirection: 'row',
      gap: 14,
      justifyContent: 'flex-end',
    },
    editActionMuted: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    editActionPrimary: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 14,
      marginTop: 4,
    },
    actionMuted: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    actionDanger: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent,
    },
    rowError: {
      marginTop: 6,
      fontSize: 11,
      color: colors.accent,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 13.5,
      color: colors.textTitle,
      maxHeight: 100,
    },
    sendBtn: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: {
      backgroundColor: colors.chipBg,
    },
    sendText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
      letterSpacing: 0.4,
    },
    sendTextDisabled: {
      color: colors.textMuted,
    },
    error: {
      padding: 10,
      paddingHorizontal: 14,
      fontSize: 11,
      color: colors.accent,
    },
  });
}
