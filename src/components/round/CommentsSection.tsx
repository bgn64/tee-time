/**
 * CommentsSection — Aurora Glass comments thread + composer for a round.
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

import { Avatar, GlassCard, NeonButton } from '@/components/aurora';
import {
  type Comment,
  editComment,
  postComment,
  softDeleteComment,
  useRoundComments,
} from '@/library/comments/useRoundComments';
import { formatRelativeTime } from '@/library/golf/scoring';
import { useAccount } from '@/library/social/AccountContext';
import { useProfile } from '@/library/social/FriendsContext';
import { useTheme } from '@/library/theme/ThemeContext';
import type { ThemeColors } from '@/library/theme/themes';

type Props = {
  roundId: string;
  ownerUserId: string;
};

export function CommentsSection({ roundId, ownerUserId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      await postComment({
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
    <GlassCard style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>COMMENTS</Text>
        <Text style={styles.headCount}>{comments.length}</Text>
      </View>

      {isLoading && comments.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.lime} />
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
          placeholder={signedInUserId ? 'Add a comment…' : 'Sign in to comment'}
          placeholderTextColor={colors.textMuted}
          editable={!!signedInUserId && !posting}
          maxLength={1000}
          multiline
        />
        {posting ? (
          <View style={styles.sendBusy}>
            <ActivityIndicator color={colors.onNeon} />
          </View>
        ) : (
          <NeonButton
            label="↑"
            size="sm"
            onPress={canSend ? handleSend : undefined}
            disabled={!canSend}
            style={styles.sendBtn}
          />
        )}
      </View>
      {postError ? <Text style={styles.error}>{postError}</Text> : null}
    </GlassCard>
  );
}

type RowProps = {
  comment: Comment;
  isOwnerComment: boolean;
  isOwn: boolean;
};

function CommentRow({ comment, isOwnerComment, isOwn }: RowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { profile } = useProfile(comment.authorUserId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = profile?.displayName?.trim() || 'Player';
  const handle = profile?.handle ? `@${profile.handle}` : displayName;
  const avatarColor = profile?.avatarColor ?? colors.cyan;
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
      await editComment({ commentId: comment.id, body: trimmed });
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
      await softDeleteComment(comment.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete comment.');
      setBusy(false);
    }
  }

  return (
    <View style={[styles.commentRow, isOwn && styles.commentRowOwn]}>
      <Avatar initial={initial} color={avatarColor} size={30} style={styles.avatar} />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={styles.commentHandle} numberOfLines={1}>{handle}</Text>
          {isOwnerComment ? <Text style={styles.scorerBadge}>· SCORER</Text> : null}
          <Text style={styles.commentWhen}>· {formatRelativeTime(comment.createdAt)}</Text>
          {comment.edited ? <Text style={styles.commentEdited}>· edited</Text> : null}
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
                <Text style={styles.editActionPrimary}>{busy ? 'Saving…' : 'Save'}</Text>
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
              <Text style={styles.actionDanger}>{busy ? 'Deleting…' : 'Delete'}</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={styles.rowError}>{error}</Text> : null}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      borderRadius: 20,
      overflow: 'hidden',
      padding: 0,
    },
    head: {
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.glassStroke,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headTitle: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.6,
      color: colors.textMuted,
    },
    headCount: {
      fontSize: 11,
      fontWeight: '900',
      color: colors.cyan,
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
      borderTopColor: colors.glassStroke,
    },
    commentRow: {
      flexDirection: 'row',
      padding: 12,
      paddingHorizontal: 14,
      gap: 10,
    },
    commentRowOwn: {
      backgroundColor: colors.glowLime,
    },
    avatar: {
      flexShrink: 0,
      borderRadius: 10,
    },
    commentBody: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderTopLeftRadius: 5,
      borderTopRightRadius: 14,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    commentMeta: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 3,
    },
    commentHandle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textTitle,
      maxWidth: 160,
    },
    scorerBadge: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
      color: colors.lime,
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
      lineHeight: 19,
      color: colors.textBody,
    },
    editBlock: {
      gap: 8,
      marginTop: 4,
    },
    editInput: {
      backgroundColor: colors.glassFill,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 12,
      padding: 9,
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
      fontWeight: '900',
      color: colors.lime,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 14,
      marginTop: 6,
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
      gap: 9,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassStroke,
      backgroundColor: 'transparent',
    },
    input: {
      flex: 1,
      backgroundColor: colors.glassFill2,
      borderWidth: 1,
      borderColor: colors.glassStroke,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      color: colors.textTitle,
      maxHeight: 100,
    },
    sendBtn: {
      width: 42,
      height: 42,
      minHeight: 42,
      borderRadius: 21,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    sendBusy: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.lime,
    },
    error: {
      padding: 10,
      paddingHorizontal: 14,
      fontSize: 11,
      color: colors.accent,
    },
  });
}
