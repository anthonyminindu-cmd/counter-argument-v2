// A fictional view or reaction has a persona and a specific target.
export function fictionalComments(comments) {
  return comments.flatMap(comment => [comment, ...fictionalComments(comment.replies ?? [])]);
}

export function fictionalDebateStats(activity) {
  const engagement = activity?.engagement;
  if (!engagement) return null;
  const commentSupport = new Map();
  for (const {comment} of engagement.commentSupport) {
    commentSupport.set(comment, (commentSupport.get(comment) ?? 0) + 1);
  }
  return {
    views: engagement.viewers.length,
    posterSupport: engagement.posterSupporters.length,
    comments: fictionalComments(activity.comments).length,
    commentSupport,
  };
}

export function fictionalProfileSupport(entries, persona) {
  let given = 0, received = 0;
  for (const entry of entries) {
    const engagement = entry.sampleActivity?.engagement;
    if (!engagement) continue;
    if (engagement.posterSupporters.includes(persona)) given++;
    const authored = new Set(fictionalComments(entry.sampleActivity.comments)
      .filter(comment=>comment.profileId === persona).map(comment=>comment.commentId));
    for (const reaction of engagement.commentSupport) {
      if (reaction.by === persona) given++;
      if (authored.has(reaction.comment)) received++;
    }
  }
  return {given, received};
}
