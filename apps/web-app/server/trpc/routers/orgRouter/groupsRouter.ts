import { z } from 'zod';
import { parse, stringify } from 'superjson';
import { router, protectedProcedure } from '../../trpc';
import { eq, and } from '@uninbox/database/orm';
import { userGroups } from '@uninbox/database/schema';
import { nanoId, nanoIdLength } from '@uninbox/utils';
import { uiColors, UiColor } from '@uninbox/types/ui';

export const orgUserGroupsRouter = router({
  createOrgUserGroups: protectedProcedure
    .input(
      z.object({
        orgPublicId: z.string().min(3).max(nanoIdLength),
        groupName: z.string().min(2).max(50),
        groupDescription: z.string().min(2).max(500).optional(),
        groupColor: z.enum(uiColors)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const queryUserId = ctx.user.userId || 0;
      const db = ctx.db;
      const { orgPublicId, groupName, groupDescription, groupColor } = input;
      const newPublicId = nanoId();

      console.log({ input });

      const userInOrg = await isUserInOrg({
        userId: queryUserId,
        orgPublicId
      });

      if (!userInOrg) {
        throw new Error('User not in org');
      }

      await db.write.insert(userGroups).values({
        publicId: newPublicId,
        name: groupName,
        description: groupDescription,
        color: groupColor,
        orgId: userInOrg.orgId,
        avatarId: ''
      });

      return {
        newGroupPublicId: newPublicId
      };
    }),
  getOrgUserGroups: protectedProcedure
    .input(
      z.object({
        orgPublicId: z.string().min(3).max(nanoIdLength)
      })
    )
    .query(async ({ ctx, input }) => {
      const queryUserId = ctx.user.userId || 0;
      const db = ctx.db;
      const { orgPublicId } = input;

      const userInOrg = await isUserInOrg({
        userId: queryUserId,
        orgPublicId
      });

      if (!userInOrg) {
        throw new Error('User not in org');
      }

      const userGroupQuery = await db.read.query.userGroups.findMany({
        columns: {
          publicId: true,
          name: true,
          description: true,
          color: true,
          avatarId: true
        },
        where: and(eq(userGroups.orgId, userInOrg.orgId)),
        with: {
          members: {
            columns: {},
            with: {
              userProfile: {
                columns: {
                  publicId: true,
                  avatarId: true,
                  firstName: true,
                  lastName: true,
                  nickname: true,
                  title: true
                }
              }
            }
          }
        }
      });
      return {
        groups: userGroupQuery
      };
    }),
  getUserGroup: protectedProcedure
    .input(
      z.object({
        orgPublicId: z.string().min(3).max(nanoIdLength),
        userGroupPublicId: z.string().min(3).max(nanoIdLength),
        newUserGroup: z.boolean().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const queryUserId = ctx.user.userId || 0;
      const db = ctx.db;
      const { orgPublicId } = input;
      const dbReplica = input.newUserGroup ? db.write : db.read;

      const userInOrg = await isUserInOrg({
        userId: queryUserId,
        orgPublicId
      });

      if (!userInOrg) {
        throw new Error('User not in org');
      }

      const userGroupQuery = await dbReplica.query.userGroups.findFirst({
        columns: {
          publicId: true,
          name: true,
          description: true,
          color: true,
          avatarId: true
        },
        where: and(
          eq(userGroups.publicId, input.userGroupPublicId),
          eq(userGroups.orgId, userInOrg.orgId)
        ),
        with: {
          members: {
            columns: {
              role: true,
              notifications: true
            },
            with: {
              userProfile: {
                columns: {
                  publicId: true,
                  avatarId: true,
                  firstName: true,
                  lastName: true,
                  nickname: true,
                  title: true
                }
              }
            }
          }
        }
      });

      return {
        group: userGroupQuery
      };
    })
});
