import { useEffect, useState } from 'react';
import { classroomService } from '../../services/classroom/classroomService';

/** True once the user is known to teach or belong to at least one class. */
export function useClassMembership(userId: string | undefined): boolean {
  const [member, setMember] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    classroomService
      .fetchMyClassrooms(userId)
      .then((rows) => { if (live) setMember(rows.length > 0); })
      .catch(() => { if (live) setMember(false); });
    return () => { live = false; };
  }, [userId]);
  return member;
}
