// Content sync (plan section 5): trip-web publishes a small index of the git content at boot (known place and
// area ids, country legs with their route seeds, holidays) through POST /ops/content-index, so mutations can
// validate ids without the files. Internal only.
import { internalMutation, internalQuery } from './_generated/server';
import { contentIndex } from './tables/app';

const contentIndexArgs = contentIndex.validator.fields;

/** Replace the content index; a no-op when the content sha is unchanged. */
export const publish = internalMutation({
	args: contentIndexArgs,
	handler: async (ctx, index): Promise<{ changed: boolean; sha: string }> => {
		const current = await ctx.db.query('contentIndex').first();
		if (current === null) {
			await ctx.db.insert('contentIndex', index);
			return { changed: true, sha: index.sha };
		}
		if (current.sha === index.sha) return { changed: false, sha: index.sha };
		await ctx.db.replace('contentIndex', current._id, index);
		return { changed: true, sha: index.sha };
	},
});

/** The sha of the published content index (null before the first publish). */
export const currentSha = internalQuery({
	args: {},
	handler: async (ctx): Promise<{ sha: string | null }> => {
		const current = await ctx.db.query('contentIndex').first();
		return { sha: current?.sha ?? null };
	},
});
