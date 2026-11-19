import { Role } from '../enums/role.enum';
import User from '../models/user.model';
import { PageRequest } from '../utils/pagination';

/** A user as the app may see it (never the password or the token). */
export interface UserSummary {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: Role;
    phone: string | null;
    created_at: Date;
}

/** A whole row: only the sign-in code reads these. */
export interface UserWithSecrets extends UserSummary {
    password: string;
    access_token: string | null;
    updated_at: Date;
}

const SUMMARY = ['id', 'username', 'email', 'full_name', 'role', 'phone', 'created_at'];

export class UserRepository {
    static async create(username: string, email: string, hashedPassword: string, fullName: string, role: Role = Role.STAFF, phone: string | null = null): Promise<number> {
        const user = await User.create({ username, email, password: hashedPassword, full_name: fullName, role, phone }, { validate: false });
        return user.id;
    }

    static async findByEmail(email: string): Promise<UserWithSecrets | undefined> {
        return ((await User.findOne({ where: { email }, raw: true })) as unknown as UserWithSecrets | null) ?? undefined;
    }

    static async findByUsername(username: string): Promise<UserWithSecrets | undefined> {
        return ((await User.findOne({ where: { username }, raw: true })) as unknown as UserWithSecrets | null) ?? undefined;
    }

    static async findById(id: number | string): Promise<UserSummary | undefined> {
        return ((await User.findOne({ where: { id }, attributes: SUMMARY, raw: true })) as unknown as UserSummary | null) ?? undefined;
    }

    static async findAll(): Promise<UserSummary[]> {
        return (await User.findAll({ attributes: SUMMARY, order: [['created_at', 'DESC'], ['id', 'ASC']], raw: true })) as unknown as UserSummary[];
    }

    /** One page of the same list, and how many users there are in all. */
    static async findPage(page: PageRequest): Promise<{ rows: UserSummary[]; total: number }> {
        const total = await User.count();
        const rows = await User.findAll({ attributes: SUMMARY, order: [['created_at', 'DESC'], ['id', 'ASC']], limit: page.limit, offset: page.offset, raw: true });
        return { rows: rows as unknown as UserSummary[], total };
    }

    static async updatePassword(id: number, hashedPassword: string): Promise<number> {
        const [affected] = await User.update({ password: hashedPassword }, { where: { id }, validate: false });
        return affected;
    }

    static async saveAccessToken(userId: number, token: string): Promise<void> {
        await User.update({ access_token: token }, { where: { id: userId }, validate: false });
    }

    static async findByAccessToken(token: string): Promise<UserSummary | undefined> {
        return ((await User.findOne({ where: { access_token: token }, attributes: SUMMARY, raw: true })) as unknown as UserSummary | null) ?? undefined;
    }

    static async deleteAccessToken(userId: number): Promise<void> {
        await User.update({ access_token: null }, { where: { id: userId }, validate: false });
    }
}
